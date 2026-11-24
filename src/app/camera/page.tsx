"use client";

/**
 * Câmera Guiada com IA em Tempo Real e Diagnóstico Pré-Upload (`src/app/camera/page.tsx`).
 *
 * Recursos:
 * - Viewfinder com silhueta anatômica bovina (garupa, ísquios e coluna).
 * - Sem botões redundantes (mantém galeria e troca de câmera/lentes).
 * - Suporta imagens de qualquer resolução (>512x512) e proporções diversas sem distorção.
 * - Score de IA ao vivo e diagnóstico pré-upload antes do salvamento definitivo.
 */
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  RefreshCcw,
  RotateCcw,
  Check,
  X,
  ArrowLeft,
  ImagePlus,
  AlertCircle,
  AlertTriangle,
  WifiOff,
  Loader2,
  Activity,
  SwitchCamera,
  Compass,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { compressImageFile, formatBytes } from "@/lib/image-client";
import {
  evaluatePhotoScoreBeforeUpload,
  getFramingCaptureRect,
  VisionScoreResult,
} from "@/lib/vision-client";
import {
  cacheLocalModelsForOffline,
  LocalAiModelStatus,
  warmUpLocalVisionModels,
} from "@/lib/local-onnx";
import { enqueueSync } from "@/lib/sync";
import { apiFetch, apiUpload } from "@/lib/api";

type Screen = "viewfinder" | "preview" | "uploading" | "done" | "error";

async function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  reticleEl?: HTMLElement | null,
  maxDim = 1600,
  quality = 0.88
): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    // Captura alinhada ao quadro visível na tela + margem segura ao redor da mira,
    // evitando bordas ocultas em 16:9 vertical que diminuem a garupa para a IA.
    const rect = reticleEl ? getFramingCaptureRect(video, reticleEl) : { sx: 0, sy: 0, sw: vw, sh: vh };
    const sw = Math.max(64, rect.sw || vw);
    const sh = Math.max(64, rect.sh || vh);

    let dw = sw;
    let dh = sh;

    if (dw > maxDim || dh > maxDim) {
      if (dw > dh) {
        dh = Math.round((dh * maxDim) / dw);
        dw = maxDim;
      } else {
        dw = Math.round((dw * maxDim) / dh);
        dh = maxDim;
      }
    }

    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;

    ctx.drawImage(video, rect.sx, rect.sy, sw, sh, 0, 0, dw, dh);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return null;
    return { blob, width: dw, height: dh };
  } catch {
    return null;
  }
}

function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId = searchParams.get("animalId") ?? "";
  const paramName = searchParams.get("animalName") ?? "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveAiCanvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const previewRef = useRef<string>("");

  const [screen, setScreen] = useState<Screen>("viewfinder");
  const [animalName, setAnimalName] = useState(paramName);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageMeta, setImageMeta] = useState("");
  const [camErr, setCamErr] = useState("");
  const [vidReady, setVidReady] = useState(false);

  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState("Centralize a garupa na guia");
  const [liveAiEnabled, setLiveAiEnabled] = useState(true);
  const [distanceGuide, setDistanceGuide] = useState<{
    status: "ideal" | "too-far" | "too-close" | "unknown";
    label: string;
  }>({ status: "unknown", label: "" });

  const lastTiltUpdateRef = useRef<number>(0);
  const lastTiltSignatureRef = useRef<string>("");

  const [tiltStatus, setTiltStatus] = useState<{
    available: boolean;
    needsPermission: boolean;
    ok: boolean;
    label: string;
  }>({
    available: false,
    needsPermission: false,
    ok: true,
    label: "",
  });

  const [scoringPreview, setScoringPreview] = useState(false);
  const [previewAnalysis, setPreviewAnalysis] = useState<VisionScoreResult | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiModelStatus>("loading");
  const [isOffline, setIsOffline] = useState(false);

  const [savedOffline, setSavedOffline] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const { toast } = useToast();

  const refreshVideoDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videoInputs);
      return videoInputs;
    } catch {
      return [];
    }
  };

  const startCamera = async (targetDeviceId?: string, targetFacing?: "environment" | "user") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr("Câmera ao vivo indisponível neste navegador. Use a Galeria abaixo.");
      return;
    }

    setVidReady(false);
    setCamErr("");
    setSwitchingCamera(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const desiredFacing = targetFacing ?? facingMode;
    const desiredDeviceId = targetDeviceId ?? selectedDeviceId;
    const isPortraitViewport =
      typeof window !== "undefined" && window.innerHeight > window.innerWidth;

    const attempts: MediaStreamConstraints[] = [];

    if (desiredDeviceId) {
      attempts.push({
        video: {
          deviceId: { exact: desiredDeviceId },
          width: { ideal: isPortraitViewport ? 960 : 1280 },
          height: { ideal: isPortraitViewport ? 1280 : 960 },
          frameRate: { ideal: 30, min: 15 },
        },
        audio: false,
      });
      attempts.push({
        video: { deviceId: { exact: desiredDeviceId }, frameRate: { ideal: 30 } },
        audio: false,
      });
    }

    attempts.push(
      {
        video: {
          facingMode: { ideal: desiredFacing },
          width: { ideal: isPortraitViewport ? 960 : 1280 },
          height: { ideal: isPortraitViewport ? 1280 : 960 },
          frameRate: { ideal: 30, min: 15 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: desiredFacing },
          frameRate: { ideal: 30 },
        },
        audio: false,
      },
      { video: { facingMode: desiredFacing }, audio: false },
      { video: true, audio: false }
    );

    let successStream: MediaStream | null = null;
    for (const c of attempts) {
      try {
        successStream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch {
        // Tenta próxima restrição
      }
    }

    if (successStream) {
      streamRef.current = successStream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = successStream;
        v.muted = true;
        v.playsInline = true;
        await v.play().catch(() => {});
      }
      setVidReady(true);
      setCamErr("");

      const track = successStream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      if (settings?.deviceId) {
        setSelectedDeviceId(settings.deviceId);
      }

      await refreshVideoDevices();
    } else {
      setCamErr("Não foi possível acessar a câmera solicitada. Tente outra lente ou dispositivo.");
    }

    setSwitchingCamera(false);
  };

  const handleSwitchCamera = async () => {
    if (switchingCamera) return;

    if (videoDevices.length > 1) {
      const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % videoDevices.length : 0;
      const nextDevice = videoDevices[nextIndex];
      setSelectedDeviceId(nextDevice.deviceId);
      await startCamera(nextDevice.deviceId);
      toast(nextDevice.label ? `Câmera: ${nextDevice.label}` : `Lente ${nextIndex + 1} ativada`, "info");
      return;
    }

    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    await startCamera(undefined, nextFacing);
    toast(nextFacing === "environment" ? "Câmera traseira ativada" : "Câmera frontal ativada", "info");
  };

  useEffect(() => {
    if (!animalId || animalName) return;
    apiFetch<any>(`/api/animals/${animalId}`)
      .then((d) => {
        if (d?.name || d?.tag) setAnimalName(d.name || d.tag);
      })
      .catch(() => {});
  }, [animalId, animalName]);

  useEffect(() => {
    if (!animalId) {
      setCamErr("Animal não especificado. Volte ao painel e selecione um animal.");
      return;
    }

    startCamera().catch(() => {});

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [animalId]);

  const liveAbortRef = useRef<AbortController | null>(null);
  const liveAiFreshUntilRef = useRef<number>(0);

  useEffect(() => {
    const syncNet = () => setIsOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    syncNet();
    window.addEventListener("online", syncNet);
    window.addEventListener("offline", syncNet);

    let cancelled = false;
    setLocalAiStatus("loading");
    void cacheLocalModelsForOffline();
    warmUpLocalVisionModels()
      .then((ok) => {
        if (!cancelled) setLocalAiStatus(ok ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setLocalAiStatus("unavailable");
      });

    return () => {
      cancelled = true;
      window.removeEventListener("online", syncNet);
      window.removeEventListener("offline", syncNet);
    };
  }, []);

  useEffect(() => {
    if (screen !== "viewfinder" || !vidReady || !!camErr) return;

    if (!liveAiEnabled) {
      liveAbortRef.current?.abort();
      liveAbortRef.current = null;
      setLiveStatus("Prévia fluida · Análise ao vivo pausada");
      return;
    }

    let active = true;
    let aiTimer: ReturnType<typeof setTimeout> | null = null;

    // Edge AI local (ONNX WASM no próprio dispositivo): funciona com ou sem internet
    // em cadência espaçada (5s) e yields explícitos para manter o viewfinder em 30fps.
    const scheduleNextAiTick = (delayMs: number) => {
      if (!active) return;
      aiTimer = setTimeout(() => {
        void runLiveAiTick();
      }, delayMs);
    };

    const runLiveAiTick = async () => {
      if (!active || !liveAiEnabled) return;
      if (document.visibilityState !== "visible") {
        scheduleNextAiTick(5000);
        return;
      }
      if (liveAbortRef.current) {
        scheduleNextAiTick(5000);
        return;
      }

      const video = videoRef.current;
      const aiCanvas = liveAiCanvasRef.current;
      if (!video || !aiCanvas || !video.videoWidth) {
        scheduleNextAiTick(2500);
        return;
      }

      const frame = await captureVideoFrame(video, aiCanvas, reticleRef.current, 512, 0.72);
      if (!frame || !active) {
        scheduleNextAiTick(5000);
        return;
      }

      const controller = new AbortController();
      liveAbortRef.current = controller;

      try {
        const res = await evaluatePhotoScoreBeforeUpload(frame.blob, controller.signal, "live");
        if (!active || controller.signal.aborted) return;

        if (res.source === "yolo-onnx") {
          if (res.localRuntime) setLocalAiStatus("ready");
          liveAiFreshUntilRef.current = Date.now() + 7000;
          setLiveScore(Math.round(res.score));
          if (res.rejectedReason) {
            setLiveStatus(res.feedback);
            setDistanceGuide({ status: "unknown", label: "" });
          } else {
            setLiveStatus(
              res.score >= 70
                ? "Enquadramento ideal"
                : res.score >= 40
                ? "Posição boa · Pode fotografar"
                : "Aproxime e centralize o animal"
            );
            if (res.box && res.box.w > 0 && res.box.h > 0) {
              const { w, h } = res.box;
              if (w < 0.35 && h < 0.35) {
                setDistanceGuide({ status: "too-far", label: "Aproxime-se do animal" });
              } else if (w > 0.9 || h > 0.9) {
                setDistanceGuide({ status: "too-close", label: "Afaste-se um pouco" });
              } else {
                setDistanceGuide({ status: "ideal", label: "Distância ideal" });
              }
            } else {
              setDistanceGuide({ status: "unknown", label: "" });
            }
          }
        }
      } catch {
        // Ignora abort/rede transitória sem interromper o viewfinder
      } finally {
        if (liveAbortRef.current === controller) {
          liveAbortRef.current = null;
        }
        scheduleNextAiTick(5000);
      }
    };

    scheduleNextAiTick(2000);

    return () => {
      active = false;
      if (aiTimer) clearTimeout(aiTimer);
      liveAbortRef.current?.abort();
      liveAbortRef.current = null;
    };
  }, [screen, vidReady, camErr, liveAiEnabled]);

  const orientationListenerRef = useRef<((ev: DeviceOrientationEvent) => void) | null>(null);

  const handleOrientationEvent = (ev: DeviceOrientationEvent) => {
    if (ev.beta === null || ev.gamma === null) return;
    const now = Date.now();
    if (now - lastTiltUpdateRef.current < 450) return;

    const absGamma = Math.abs(ev.gamma);
    const verticalOk = ev.beta >= 50 && ev.beta <= 120;
    const horizonOk = absGamma <= 12;

    const nextOk = horizonOk && verticalOk;
    const nextLabel = !horizonOk
      ? "Nivele o aparelho horizontalmente"
      : !verticalOk
      ? "Mantenha a câmera na vertical"
      : "Ângulo nivelado";

    const nextSig = `${nextOk}:${nextLabel}`;
    if (lastTiltSignatureRef.current === nextSig) return;
    lastTiltUpdateRef.current = now;
    lastTiltSignatureRef.current = nextSig;

    setTiltStatus({
      available: true,
      needsPermission: false,
      ok: nextOk,
      label: nextLabel,
    });
  };

  useEffect(() => {
    if (screen !== "viewfinder" || typeof window === "undefined") return;
    if (!("DeviceOrientationEvent" in window)) return;

    const OrientationEventCtor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof OrientationEventCtor?.requestPermission === "function") {
      setTiltStatus((prev) => ({ ...prev, needsPermission: true }));
      return () => {
        if (orientationListenerRef.current) {
          window.removeEventListener("deviceorientation", orientationListenerRef.current);
          orientationListenerRef.current = null;
        }
      };
    }

    orientationListenerRef.current = handleOrientationEvent;
    window.addEventListener("deviceorientation", handleOrientationEvent);
    return () => {
      if (orientationListenerRef.current) {
        window.removeEventListener("deviceorientation", orientationListenerRef.current);
        orientationListenerRef.current = null;
      }
    };
  }, [screen]);

  const requestOrientationPermission = async () => {
    const OrientationEventCtor = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
      }
    ).DeviceOrientationEvent;
    if (!OrientationEventCtor?.requestPermission) return;
    try {
      const res = await OrientationEventCtor.requestPermission();
      if (res === "granted") {
        setTiltStatus({ available: true, needsPermission: false, ok: true, label: "Nível ativo" });
        if (orientationListenerRef.current) {
          window.removeEventListener("deviceorientation", orientationListenerRef.current);
        }
        orientationListenerRef.current = handleOrientationEvent;
        window.addEventListener("deviceorientation", handleOrientationEvent);
      } else {
        setTiltStatus((p) => ({ ...p, needsPermission: false }));
      }
    } catch {
      setTiltStatus((p) => ({ ...p, needsPermission: false }));
    }
  };

  useEffect(() => {
    return () => {
      if (previewRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  const runPreUploadScoring = async (blob: Blob) => {
    setScoringPreview(true);
    setPreviewAnalysis(null);
    try {
      const result = await evaluatePhotoScoreBeforeUpload(blob);
      setPreviewAnalysis(result);
    } finally {
      setScoringPreview(false);
    }
  };

  const handleCapture = async () => {
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !vidReady) {
      setCamErr("Aguarde a câmera iniciar ou envie da galeria.");
      return;
    }

    const result = await captureVideoFrame(video, canvas, reticleRef.current, 2048, 0.94);
    if (!result) {
      setCamErr("Não foi possível capturar o quadro. Envie da galeria.");
      return;
    }

    if (previewRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(previewRef.current);
    }

    blobRef.current = result.blob;
    const url = URL.createObjectURL(result.blob);
    previewRef.current = url;

    navigator.vibrate?.(40);
    setPreviewUrl(url);
    setImageMeta(`${result.width}×${result.height} · ${formatBytes(result.blob.size)}`);
    setScreen("preview");

    void runPreUploadScoring(result.blob);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const compressed = await compressImageFile(file, 2048, 0.94);

    if (previewRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(previewRef.current);
    }

    blobRef.current = compressed.blob;
    const url = URL.createObjectURL(compressed.blob);
    previewRef.current = url;

    setPreviewUrl(url);
    setImageMeta(
      compressed.width > 0
        ? `${compressed.width}×${compressed.height} · ${formatBytes(compressed.compressedSize)}`
        : formatBytes(compressed.compressedSize)
    );
    setScreen("preview");

    if (galleryRef.current) galleryRef.current.value = "";

    void runPreUploadScoring(compressed.blob);
  };

  const handleSave = async () => {
    const blob = blobRef.current;
    if (!blob || !animalId) return;

    setScreen("uploading");
    setUploadErr("");
    setSavedOffline(false);

    const fileName = `rear_${animalId}_${Date.now()}.jpg`;
    const fd = new FormData();
    fd.append("file", blob, fileName);
    fd.append("animalId", animalId);
    fd.append("view", "REAR");
    if (previewAnalysis && typeof previewAnalysis.score === "number") {
      fd.append("preScore", String(previewAnalysis.score));
      fd.append("aiSource", previewAnalysis.localRuntime ? "yolo-onnx-client" : previewAnalysis.source);
    }

    try {
      const data = await apiUpload<any>("/api/photos/upload", fd);

      if (typeof data?.score === "number") {
        setPreviewAnalysis((prev) => ({
          score: data.score,
          lowQuality: Boolean(data.lowQuality),
          source: "yolo-onnx",
          localRuntime: prev?.localRuntime,
          feedback: prev?.feedback || "Foto anatômica validada e registrada no dataset.",
          box: prev?.box,
        }));
      }
      setScreen("done");
    } catch (err: any) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          const arrayBuf = await blob.arrayBuffer();
          await enqueueSync(
            "/api/photos/upload",
            "POST",
            {
              file: arrayBuf,
              fileName,
              animalId,
              preScore: previewAnalysis?.score,
              aiSource: previewAnalysis?.localRuntime ? "yolo-onnx-client" : undefined,
            },
            true
          );
          setSavedOffline(true);
          setScreen("done");
          return;
        } catch {
          // Segue para erro
        }
      }
      setUploadErr(err?.message || "Sem conexão com o servidor. Tente novamente.");
      setScreen("error");
    }
  };

  const retake = () => {
    blobRef.current = null;
    if (previewRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = "";
    setPreviewUrl("");
    setImageMeta("");
    setPreviewAnalysis(null);
    setScoringPreview(false);
    setSavedOffline(false);
    setUploadErr("");
    setScreen("viewfinder");
  };

  const finalScore = previewAnalysis?.score ?? null;
  const isFinalLow = finalScore !== null && finalScore < 40;

  if (screen === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6 bg-[#0D110F] text-white">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl ${
            savedOffline
              ? "bg-[#B45309]"
              : isFinalLow
              ? "bg-[#B45309]"
              : "bg-[#184E3A] border border-[#2E7D5B]"
          }`}
        >
          {savedOffline ? (
            <WifiOff className="w-9 h-9 text-white" />
          ) : (
            <Check className="w-10 h-10 text-white stroke-[3]" />
          )}
        </div>

        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-bold text-white mb-2">
            {savedOffline ? "Foto salva no aparelho" : "Foto salva"}
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">
            {savedOffline ? (
              <>
                A foto de <strong className="text-white">{animalName || "animal"}</strong> será
                enviada automaticamente assim que houver conexão.
              </>
            ) : (
              <>
                Foto de <strong className="text-white">{animalName || "animal"}</strong> salva com
                sucesso e adicionada ao dataset na ficha.
              </>
            )}
          </p>

          {finalScore !== null && !savedOffline && (
            <div className="mt-4 flex justify-center">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border ${
                  finalScore >= 40
                    ? "bg-[#184E3A]/60 text-[#74C69D] border-[#2E7D5B]/50"
                    : "bg-[#B45309]/20 text-amber-200 border-[#B45309]/40"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Enquadramento: {Math.round(finalScore)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="btn-primary w-full py-3.5 text-sm"
          >
            Ver ficha do animal
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-[#141A17] hover:bg-[#1E2722] border border-white/15 rounded-[10px] text-sm font-semibold text-white transition"
          >
            Tirar outra foto
          </button>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6 bg-[#0D110F] text-white">
        <div className="w-20 h-20 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center">
          <X className="w-10 h-10 text-red-400 stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-xl font-extrabold text-white mb-2">Falha no envio</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            {uploadErr || "Não foi possível salvar a imagem."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={handleSave} className="btn-primary w-full py-4 text-sm">
            Tentar Reenviar Agora
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-[#141A17] hover:bg-[#1E2722] border border-white/15 rounded-[10px] text-white text-sm font-semibold transition"
          >
            Escolher Outra Foto
          </button>
        </div>
      </div>
    );
  }

  const isLiveGood = (liveScore ?? 0) >= 45;

  return (
    <div className="relative w-full h-[100dvh] bg-[#0D110F] overflow-hidden select-none">
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={opticalCanvasRef} className="hidden" />
      <canvas ref={liveAiCanvasRef} className="hidden" />

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={() => setVidReady(true)}
        onPlaying={() => setVidReady(true)}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: screen === "viewfinder" ? "block" : "none" }}
      />

      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-4 py-2 gap-2"
        style={{
          paddingTop: "max(0.6rem, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(13,17,15,0.92) 0%, transparent 100%)",
          display: screen === "uploading" ? "none" : "flex",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 min-h-[38px] rounded-[8px] bg-[#141A17]/85 hover:bg-[#1E2722] active:scale-95 border border-white/15 text-white text-xs font-semibold shrink-0 touch-manipulation transition"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Voltar</span>
        </button>

        <div className="text-center min-w-0 px-1">
          <p className="text-white font-bold text-xs sm:text-sm truncate max-w-[160px] sm:max-w-[260px]">
            {animalName || "Captura guiada"}
          </p>
          <p className="text-[10px] font-medium text-[#74C69D] truncate">
            {localAiStatus === "ready"
              ? isOffline
                ? "Modo offline ativo"
                : "Guia automático ativo"
              : localAiStatus === "loading"
              ? "Preparando guia…"
              : "Enquadre a traseira do animal"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLiveAiEnabled((v) => !v)}
          className={`px-2.5 py-1.5 min-h-[34px] rounded-[8px] text-[11px] font-semibold border shrink-0 transition ${
            liveAiEnabled
              ? "bg-[#184E3A]/85 border-[#2E7D5B] text-[#74C69D]"
              : "bg-[#141A17]/85 border-white/15 text-white/75"
          }`}
          title="Alternar guia automático na prévia"
        >
          {liveAiEnabled ? "Guia ativo" : "Guia pausado"}
        </button>
      </div>

      {screen === "viewfinder" && (
        <>
          {!camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
              <div
                ref={reticleRef}
                className={`relative w-[74%] max-w-[290px] aspect-[3/4] rounded-[6px] border transition-colors duration-200 ${
                  isLiveGood ? "border-[#74C69D]/80" : "border-white/30"
                }`}
              >
                {vidReady && liveScore !== null && (
                  <div
                    className={`absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-[8px] text-[11px] font-bold whitespace-nowrap border transition-colors ${
                      isLiveGood
                        ? "bg-[#0D110F]/85 text-[#74C69D] border-[#2E7D5B]"
                        : "bg-[#0D110F]/85 text-amber-200 border-[#B45309]/60"
                    }`}
                  >
                    <span>
                      {isLiveGood ? "Enquadramento ideal" : "Ajuste o enquadramento"} ({liveScore}%)
                    </span>
                  </div>
                )}

                <div
                  className={`absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 transition-colors ${
                    isLiveGood ? "border-[#74C69D]" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -top-0.5 -right-0.5 w-6 h-6 border-t-2 border-r-2 transition-colors ${
                    isLiveGood ? "border-[#74C69D]" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-2 border-l-2 transition-colors ${
                    isLiveGood ? "border-[#74C69D]" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 transition-colors ${
                    isLiveGood ? "border-[#74C69D]" : "border-amber-400"
                  }`}
                />

                {/* Silhueta anatômica bovina na mira */}
                <svg
                  viewBox="0 0 200 260"
                  className="w-full h-full opacity-40 pointer-events-none"
                  fill="none"
                  stroke={isLiveGood ? "#74C69D" : "#FBBF24"}
                  strokeWidth="2"
                  strokeDasharray="6 6"
                >
                  <line x1="100" y1="35" x2="100" y2="225" />
                  <path d="M50 75 Q100 50 150 75 L160 185 Q100 200 40 185 Z" />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
                  <div className="w-6 h-0.5 bg-white/70" />
                  <div className="h-6 w-0.5 bg-white/70 -ml-3" />
                </div>

                <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-[#0D110F]/85 border border-white/15 text-white/95 text-[11px] font-semibold px-3 py-1 rounded-[8px] whitespace-nowrap">
                  {liveStatus}
                </div>

                {/* Indicadores compactos de ângulo e distância */}
                {(tiltStatus.available || tiltStatus.needsPermission || distanceGuide.label) && (
                  <div className="absolute -bottom-[4.25rem] left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 w-max max-w-[92vw]">
                    {tiltStatus.needsPermission ? (
                      <button
                        type="button"
                        onClick={requestOrientationPermission}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#0D110F]/85 border border-white/20 text-[10px] font-semibold text-white/85"
                      >
                        <Compass className="w-3 h-3 text-[#74C69D]" />
                        Ativar nível
                      </button>
                    ) : (
                      tiltStatus.available && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border text-[10px] font-semibold ${
                            tiltStatus.ok
                              ? "bg-[#0D110F]/85 border-[#2E7D5B] text-[#74C69D]"
                              : "bg-[#0D110F]/85 border-[#B45309]/60 text-amber-200"
                          }`}
                        >
                          <Compass className="w-3 h-3" />
                          {tiltStatus.label}
                        </span>
                      )
                    )}

                    {distanceGuide.label && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] border text-[10px] font-semibold ${
                          distanceGuide.status === "ideal"
                            ? "bg-[#0D110F]/85 border-[#2E7D5B] text-[#74C69D]"
                            : "bg-[#0D110F]/85 border-[#B45309]/60 text-amber-200"
                        }`}
                      >
                        {distanceGuide.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!vidReady && !camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/75 text-sm font-medium">
                <RefreshCcw className="w-6 h-6 animate-spin text-[#74C69D]" />
                <span>Inicializando câmera…</span>
              </div>
            </div>
          )}

          {camErr && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 p-6 text-center bg-[#0D110F]/95">
              <div className="w-16 h-16 rounded-[14px] flex items-center justify-center bg-[#184E3A]/40 border border-[#2E7D5B]">
                <AlertCircle className="w-8 h-8 text-[#74C69D]" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-white font-extrabold text-base mb-1">
                  Câmera indisponível
                </h3>
                <p className="text-white/65 text-xs leading-relaxed">{camErr}</p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2"
                >
                  <ImagePlus className="w-4 h-4" />
                  Selecionar foto da galeria
                </button>
              </div>
            </div>
          )}

          <div
            className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-around py-4 px-4 sm:px-8"
            style={{
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(13,17,15,0.94) 0%, transparent 100%)",
            }}
          >
            <button
              type="button"
              onClick={handleSwitchCamera}
              disabled={switchingCamera}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition active:scale-95 disabled:opacity-50"
              title="Alternar entre câmeras ou inverter direção"
              aria-label="Trocar de câmera"
            >
              <div className="w-11 h-11 rounded-[10px] bg-[#141A17]/85 flex items-center justify-center border border-white/15">
                <SwitchCamera className={`w-5 h-5 ${switchingCamera ? "animate-spin text-[#74C69D]" : ""}`} />
              </div>
              <span className="text-[10px] font-semibold">
                {videoDevices.length > 1 ? `Lentes (${videoDevices.length})` : "Inverter"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCapture}
              disabled={!vidReady || !!camErr}
              aria-label="Capturar foto agora"
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-[#74C69D] p-1 flex items-center justify-center active:scale-95 disabled:opacity-35 transition-transform bg-[#184E3A]/30 shadow-lg"
            >
              <div className="w-full h-full rounded-full bg-[#2E7D5B] hover:bg-[#38946D] flex items-center justify-center transition">
                <Camera className="w-7 h-7 text-white" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (galleryRef.current) {
                  galleryRef.current.value = "";
                  galleryRef.current.click();
                }
              }}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition active:scale-95"
              aria-label="Enviar da galeria"
            >
              <div className="w-11 h-11 rounded-[10px] bg-[#141A17]/85 flex items-center justify-center border border-white/15">
                <ImagePlus className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold">Galeria</span>
            </button>
          </div>
        </>
      )}

      {screen === "preview" && previewUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#0D110F]">
          <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4 overflow-hidden">
            <div className="relative inline-flex max-w-full max-h-full items-center justify-center">
              <img
                src={previewUrl}
                alt="Preview da captura"
                className="max-w-full max-h-[68dvh] w-auto h-auto object-contain rounded-[10px] border border-white/10 shadow-xl"
              />
              {previewAnalysis?.source === "yolo-onnx" &&
                previewAnalysis.box &&
                previewAnalysis.box.w > 0 &&
                previewAnalysis.score >= 15 && (
                  <div
                    aria-label="Região identificada na foto"
                    className={`pointer-events-none absolute rounded border-2 ${
                      previewAnalysis.score >= 40
                        ? "border-[#74C69D] shadow-[0_0_0_1px_rgba(46,125,91,0.5)]"
                        : "border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.45)]"
                    }`}
                    style={{
                      left: `${Math.max(0, (previewAnalysis.box.cx - previewAnalysis.box.w / 2) * 100)}%`,
                      top: `${Math.max(0, (previewAnalysis.box.cy - previewAnalysis.box.h / 2) * 100)}%`,
                      width: `${Math.min(100, previewAnalysis.box.w * 100)}%`,
                      height: `${Math.min(100, previewAnalysis.box.h * 100)}%`,
                    }}
                  >
                    <span
                      className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded-[6px] text-[10px] font-bold whitespace-nowrap ${
                        previewAnalysis.score >= 40
                          ? "bg-[#184E3A] text-white"
                          : "bg-amber-400 text-[#0D110F]"
                      }`}
                    >
                      Enquadramento {Math.round(previewAnalysis.score)}%
                    </span>
                  </div>
                )}
            </div>
            {imageMeta && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#141A17]/90 border border-white/10 text-white/75 text-[11px] font-semibold px-2.5 py-0.5 rounded-[7px] backdrop-blur-md">
                {imageMeta}
              </div>
            )}
          </div>

          <div className="px-3 pb-2 max-w-lg mx-auto w-full">
            <div className="rounded-[12px] bg-[#141A17]/95 border border-white/10 p-3.5 backdrop-blur-md">
              {scoringPreview ? (
                <div className="flex items-center gap-3 py-1">
                  <Loader2 className="w-5 h-5 animate-spin text-[#74C69D] shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white">
                      Verificando enquadramento…
                    </p>
                    <p className="text-[11px] text-white/60">
                      Analisando nitidez e posição do animal
                    </p>
                  </div>
                </div>
              ) : previewAnalysis ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Activity
                        className={`w-4 h-4 ${
                          previewAnalysis.score >= 40 ? "text-[#74C69D]" : "text-amber-400"
                        }`}
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-white/75">
                        Qualidade do enquadramento
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        previewAnalysis.score >= 40
                          ? "bg-[#184E3A]/60 text-[#74C69D] border border-[#2E7D5B]/50"
                          : "bg-[#B45309]/25 text-amber-200 border border-[#B45309]/40"
                      }`}
                    >
                      {Math.round(previewAnalysis.score)}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-sm bg-[#1E2722] overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all duration-500 ${
                        previewAnalysis.score >= 40 ? "bg-[#2E7D5B]" : "bg-[#B45309]"
                      }`}
                      style={{ width: `${Math.max(8, Math.min(100, previewAnalysis.score))}%` }}
                    />
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-white/75 leading-snug">
                    {previewAnalysis.lowQuality && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span>{previewAnalysis.feedback}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="flex gap-2.5 px-3 py-3 bg-[#141A17]/95 border-t border-white/10 max-w-lg mx-auto w-full"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] bg-[#1E2722] hover:bg-[#26322B] active:scale-98 rounded-[10px] text-white font-semibold text-xs sm:text-sm touch-manipulation transition"
            >
              <RotateCcw className="w-4 h-4" />
              Tirar Outra
            </button>
            <button
              onClick={handleSave}
              disabled={scoringPreview}
              className="flex-1 btn-primary py-3 min-h-[44px] rounded-[10px] text-xs sm:text-sm active:scale-98 touch-manipulation justify-center font-bold"
            >
              <Check className="w-4 h-4" />
              Salvar Avaliação
            </button>
          </div>
        </div>
      )}

      {screen === "uploading" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-[#0D110F]/90 backdrop-blur-md">
          <div className="bg-[#141A17] border border-white/10 rounded-[14px] p-8 flex flex-col items-center gap-4 max-w-xs w-full text-center shadow-2xl">
            <RefreshCcw className="w-9 h-9 animate-spin text-[#74C69D]" />
            <div>
              <p className="text-white font-bold text-base">Salvando captura…</p>
              <p className="text-white/60 text-xs mt-1">
                Enviando imagem para a ficha do animal
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CameraPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-3 bg-[#0D110F] text-white/60 text-sm">
          <RefreshCcw className="w-6 h-6 animate-spin text-[#74C69D]" />
          <span>Preparando câmera…</span>
        </div>
      }
    >
      <CameraContent />
    </Suspense>
  );
}
