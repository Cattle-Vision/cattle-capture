"use client";

/**
 * Câmera Guiada com IA em Tempo Real e Diagnóstico Pré-Upload (`src/app/camera/page.tsx`).
 *
 * Arquitetura e Melhorias Solicitadas:
 * 1. **Zero Checkboxes Desnecessários**:
 *    Removido o checklist manual de 3 itens que bloqueava o salvamento.
 * 2. **Score de IA em Tempo Real no Viewfinder**:
 *    Enquanto a câmera aponta para o animal, analisa continuamente o quadro (combinando
 *    análise óptica instantânea no cliente + inferência YOLOv8 ONNX periódica em `/api/ai/score`),
 *    exibindo o Score ao vivo e mudando a cor da mira conforme a qualidade do enquadramento.
 * 3. **Score de IA Calculado ANTES do Upload (na tela de Preview)**:
 *    Assim que o usuário tira a foto ou seleciona uma imagem da galeria, o sistema calcula
 *    e exibe imediatamente o Score de Confiança IA e o diagnóstico na tela de Preview,
 *    **antes** de o usuário clicar em "Salvar no Dataset".
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
  Sparkles,
  Upload,
  WifiOff,
  Loader2,
  Activity,
  SwitchCamera,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { compressImageFile, formatBytes } from "@/lib/image-client";
import {
  computeInstantVideoScore,
  evaluatePhotoScoreBeforeUpload,
  getReticleCropCoordinates,
  VisionScoreResult,
} from "@/lib/vision-client";
import { enqueueSync } from "@/lib/sync";

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

    // Obtém o recorte estrito projetado da mira sobre o frame real do sensor
    const { sx, sy, sw, sh } = getReticleCropCoordinates(video, reticleEl);

    let dw = Math.round(sw);
    let dh = Math.round(sh);

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

    // Desenha EXCLUSIVAMENTE os pixels delimitados pela mira de enquadramento
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);

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
  const scratchCanvasRef = useRef<HTMLCanvasElement>(null);
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

  // Estado do Score em Tempo Real (Viewfinder)
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState("Analisando quadro…");

  // Estado do Score Pré-Upload (calculado logo após tirar/escolher a foto, antes de salvar!)
  const [scoringPreview, setScoringPreview] = useState(false);
  const [previewAnalysis, setPreviewAnalysis] = useState<VisionScoreResult | null>(null);

  // Estado pós-upload
  const [savedOffline, setSavedOffline] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  // Estados de Gerenciamento de Câmera / Lentes / Dispositivos
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [activeDeviceLabel, setActiveDeviceLabel] = useState("");
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
      setCamErr("Câmera ao vivo indisponível neste navegador. Use a Câmera do Aparelho ou Galeria abaixo.");
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

    const attempts: MediaStreamConstraints[] = [];

    if (desiredDeviceId) {
      attempts.push({
        video: {
          deviceId: { exact: desiredDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      attempts.push({
        video: { deviceId: { exact: desiredDeviceId } },
        audio: false,
      });
    }

    attempts.push(
      {
        video: {
          facingMode: { ideal: desiredFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
        // tenta próxima constraint
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
      if (track?.label) {
        setActiveDeviceLabel(track.label);
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
    fetch(`/api/animals/${animalId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.name || d?.tag) setAnimalName(d.name || d.tag);
      })
      .catch(() => {});
  }, [animalId, animalName]);

  /* ── Inicializa câmera ao vivo ── */
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

  /* ── Loop de IA em Tempo Real no Viewfinder ── */
  useEffect(() => {
    if (screen !== "viewfinder" || !vidReady || !!camErr) return;

    let active = true;
    let inFlightServerCheck = false;
    let tickCount = 0;

    // Monitoramento contínuo: orientação óptica a 400ms e IA periódica estável
    const interval = setInterval(async () => {
      if (!active) return;
      const video = videoRef.current;
      const scratch = scratchCanvasRef.current;
      if (!video || !scratch || !video.videoWidth) return;

      // 1. Orientação óptica contínua no visor (foco, luz e centralização)
      const instant = computeInstantVideoScore(video, scratch, reticleRef.current);
      if (instant && active) {
        setLiveStatus(instant.statusText);
      }

      // 2. Inferência de Confiança IA periódica (a cada ~1.6s, sem misturar com métricas ópticas locais)
      tickCount++;
      if (tickCount % 4 === 0 && !inFlightServerCheck && navigator.onLine) {
        inFlightServerCheck = true;
        try {
          const miniFrame = await captureVideoFrame(video, scratch, reticleRef.current, 384, 0.75);
          if (miniFrame && active) {
            const aiRes = await evaluatePhotoScoreBeforeUpload(miniFrame.blob);
            if (active && typeof aiRes.score === "number" && aiRes.source === "yolo-onnx") {
              setLiveScore(Math.round(aiRes.score));
            }
          }
        } catch {
          // ignora erro no loop live
        } finally {
          inFlightServerCheck = false;
        }
      }
    }, 400);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [screen, vidReady, camErr]);

  useEffect(() => {
    return () => {
      if (previewRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  /* ── Avalia o Score IA IMEDIATAMENTE após capturar/escolher a foto (ANTES do upload!) ── */
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

  /* ── Captura do frame de vídeo ao vivo ── */
  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !vidReady) {
      setCamErr("Aguarde a câmera iniciar ou envie da galeria.");
      return;
    }

    const result = await captureVideoFrame(video, canvas, reticleRef.current, 1600, 0.88);
    if (!result) {
      setCamErr("Não foi possível capturar o quadro. Use a Câmera Nativa.");
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

    // Calcula o Score IA ANTES de o usuário fazer o upload
    void runPreUploadScoring(result.blob);
  };

  /* ── Captura via Câmera Nativa ou Galeria (com compressão + Score IA pré-upload!) ── */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aplica recorte proporcional 3:4 padronizado para focar a garupa
    const compressed = await compressImageFile(file, 1600, 0.86, 3 / 4);

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

    // Calcula o Score IA imediatamente na tela de Preview, ANTES do upload
    void runPreUploadScoring(compressed.blob);
  };

  /* ── Salvar no Dataset (envia o score já calculado junto com a imagem) ── */
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
    }

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (typeof data.score === "number" && !previewAnalysis) {
          setPreviewAnalysis({
            score: data.score,
            lowQuality: Boolean(data.lowQuality),
            source: "yolo-onnx",
            feedback: "",
          });
        }
        setScreen("done");
        return;
      }

      setUploadErr(data.error || `Falha no envio (HTTP ${res.status}). Tente novamente.`);
      setScreen("error");
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          const arrayBuf = await blob.arrayBuffer();
          await enqueueSync(
            "/api/upload",
            "POST",
            { file: arrayBuf, fileName, animalId },
            true
          );
          setSavedOffline(true);
          setScreen("done");
          return;
        } catch {
          // Segue para erro padrão
        }
      }
      setUploadErr("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
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

  /* ── Tela de Sucesso ── */
  if (screen === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6 bg-slate-950 text-white">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl ${
            savedOffline
              ? "bg-amber-500"
              : isFinalLow
              ? "bg-amber-600"
              : "bg-emerald-500 shadow-emerald-500/25"
          }`}
        >
          {savedOffline ? (
            <WifiOff className="w-9 h-9 text-white" />
          ) : (
            <Check className="w-10 h-10 text-white stroke-[3]" />
          )}
        </div>

        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-extrabold text-white mb-2">
            {savedOffline ? "Salva na fila offline!" : "Foto salva no dataset!"}
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            {savedOffline ? (
              <>
                A imagem de <strong className="text-white">{animalName || "animal"}</strong> será
                sincronizada automaticamente quando houver conexão.
              </>
            ) : (
              <>
                Imagem posterior de{" "}
                <strong className="text-white">{animalName || "animal"}</strong> registrada com
                sucesso.
              </>
            )}
          </p>

          {finalScore !== null && !savedOffline && (
            <div
              className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold border ${
                finalScore >= 40
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-300 border-amber-500/30"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Confiança IA Registrada: {Math.round(finalScore)}%
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="btn-primary w-full py-4 text-sm"
          >
            Ver Ficha do Animal
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold text-white transition"
          >
            Tirar Outra Foto
          </button>
        </div>
      </div>
    );
  }

  /* ── Tela de Erro ── */
  if (screen === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6 bg-slate-950 text-white">
        <div className="w-20 h-20 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center">
          <X className="w-10 h-10 text-red-400 stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-xl font-extrabold text-white mb-2">Falha no envio</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            {uploadErr || "Não foi possível salvar a imagem."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={handleSave} className="btn-primary w-full py-4 text-sm">
            Tentar Reenviar Agora
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-slate-800 rounded-xl text-white text-sm font-bold"
          >
            Escolher Outra Foto
          </button>
        </div>
      </div>
    );
  }

  const isLiveGood = (liveScore ?? 0) >= 45;

  /* ── Viewfinder + Preview + Uploading ── */
  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 overflow-hidden select-none">
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={scratchCanvasRef} className="hidden" />

      {/* Input de Seleção de Foto / Galeria */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* Vídeo ao vivo */}
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

      {/* Header Superior HUD */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-4 py-2 gap-2"
        style={{
          paddingTop: "max(0.6rem, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(2,6,23,0.92) 0%, transparent 100%)",
          display: screen === "uploading" ? "none" : "flex",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-semibold shrink-0"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Voltar</span>
        </button>

        <div className="text-center min-w-0 px-1">
          <p className="text-white font-bold text-xs sm:text-sm truncate max-w-[130px] xs:max-w-[170px] sm:max-w-[220px]">
            {animalName || "Captura Guiada"}
          </p>
          <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-emerald-400 truncate">
            Vista Posterior · ICC
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleSwitchCamera}
            disabled={switchingCamera}
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-semibold"
            title="Alternar entre câmeras ou inverter direção"
            aria-label="Alternar câmera"
          >
            <SwitchCamera className={`w-4 h-4 ${switchingCamera ? "animate-spin text-emerald-400" : ""}`} />
            <span className="hidden sm:inline">
              {videoDevices.length > 1 ? `Lentes (${videoDevices.length})` : "Inverter"}
            </span>
          </button>

          <button
            onClick={() => galleryRef.current?.click()}
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-semibold shrink-0"
            title="Escolher da galeria"
            aria-label="Escolher da galeria"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden xs:inline">Galeria</span>
          </button>
        </div>
      </div>

      {/* ── MODO VIEWFINDER COM CONFIANÇA EM TEMPO REAL BASEADA NA MIRA ── */}
      {screen === "viewfinder" && (
        <>
          {!camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
              <div
                ref={reticleRef}
                className={`relative w-[74%] max-w-[290px] aspect-[3/4] rounded-sm border transition-colors duration-200 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)] ${
                  isLiveGood ? "border-emerald-400/60" : "border-white/25"
                }`}
              >
                {/* Badge de Confiança em Tempo Real no Topo do Guia */}
                {vidReady && liveScore !== null && (
                  <div
                    className={`absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold whitespace-nowrap backdrop-blur-md border transition-colors ${
                      isLiveGood
                        ? "bg-slate-950/90 text-emerald-300 border-emerald-500/50"
                        : "bg-slate-950/90 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    <span>Confiança ao Vivo: {liveScore}%</span>
                  </div>
                )}

                {/* Cantoneiras Técnicas Ortogonais */}
                <div
                  className={`absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -top-0.5 -right-0.5 w-6 h-6 border-t-2 border-r-2 transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-2 border-l-2 transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />

                {/* Silhueta guia central da vaca (garupa e coluna anatômica) */}
                <svg
                  viewBox="0 0 200 260"
                  className="w-full h-full opacity-40 pointer-events-none"
                  fill="none"
                  stroke={isLiveGood ? "#34D399" : "#FBBF24"}
                  strokeWidth="2"
                  strokeDasharray="6 6"
                >
                  {/* Linha central da coluna/cauda */}
                  <line x1="100" y1="35" x2="100" y2="225" />
                  {/* Contorno referencial de garupa e ísquios */}
                  <path d="M50 75 Q100 50 150 75 L160 185 Q100 200 40 185 Z" />
                </svg>

                {/* Linhas de retículo e mira técnica central */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
                  <div className="w-6 h-0.5 bg-white/70" />
                  <div className="h-6 w-0.5 bg-white/70 -ml-3" />
                </div>

                <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-white/15 text-white/90 text-[11px] font-semibold px-3 py-1 rounded-md whitespace-nowrap backdrop-blur-md">
                  {liveStatus}
                </div>
              </div>
            </div>
          )}

          {/* Carregando Câmera */}
          {!vidReady && !camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/70 text-sm font-medium">
                <RefreshCcw className="w-6 h-6 animate-spin text-emerald-400" />
                <span>Inicializando sensor de câmera…</span>
              </div>
            </div>
          )}

          {/* Fallback quando câmera ao vivo não está disponível */}
          {camErr && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 p-6 text-center bg-slate-950/95">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30">
                <AlertCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-white font-extrabold text-base mb-1">
                  Câmera Indisponível
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">{camErr}</p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2"
                >
                  <ImagePlus className="w-4 h-4" />
                  Selecionar Foto da Galeria
                </button>
              </div>
            </div>
          )}

          {/* Controles de Disparo */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-around py-4 px-4 sm:px-8"
            style={{
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(2,6,23,0.92) 0%, transparent 100%)",
            }}
          >
            {/* 1. Trocar Câmera / Lentes */}
            <button
              type="button"
              onClick={handleSwitchCamera}
              disabled={switchingCamera}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white transition active:scale-95 disabled:opacity-50"
              title="Alternar entre câmeras ou inverter direção"
              aria-label="Trocar de câmera"
            >
              <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                <SwitchCamera className={`w-5 h-5 ${switchingCamera ? "animate-spin text-emerald-400" : ""}`} />
              </div>
              <span className="text-[10px] font-semibold">
                {videoDevices.length > 1 ? `Lentes (${videoDevices.length})` : "Inverter"}
              </span>
            </button>

            {/* 2. Disparo em Tempo Real (Frame do visor com Confiança IA) */}
            <button
              type="button"
              onClick={handleCapture}
              disabled={!vidReady || !!camErr}
              aria-label="Capturar foto agora"
              className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-emerald-400 p-1 flex items-center justify-center active:scale-95 disabled:opacity-35 transition-transform bg-emerald-500/10 shadow-lg shadow-emerald-500/25"
            >
              <div className="w-full h-full rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center transition">
                <Camera className="w-7 h-7 text-slate-950" />
              </div>
            </button>

            {/* 3. Galeria de Fotos */}
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
              <div className="w-11 h-11 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
                <ImagePlus className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold">Galeria</span>
            </button>
          </div>
        </>
      )}

      {/* ── MODO PREVIEW: EXIBE CONFIANÇA IA ANTES DO UPLOAD (SEM CHECKBOXES!) ── */}
      {screen === "preview" && previewUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-950">
          {/* Imagem Capturada */}
          <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4 overflow-hidden">
            <img
              src={previewUrl}
              alt="Preview da captura"
              className="max-w-full max-h-full object-contain rounded-lg border border-white/10 shadow-xl"
            />
            {imageMeta && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-white/10 text-slate-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-md backdrop-blur-md">
                {imageMeta}
              </div>
            )}
          </div>

          {/* Card de Diagnóstico de Confiança Pré-Upload */}
          <div className="px-3 pb-2 max-w-lg mx-auto w-full">
            <div className="rounded-lg bg-slate-900/95 border border-white/10 p-3.5 backdrop-blur-md">
              {scoringPreview ? (
                <div className="flex items-center gap-3 py-1">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white">
                      Analisando imagem com IA antes do envio…
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Verificando enquadramento da traseira e nitidez
                    </p>
                  </div>
                </div>
              ) : previewAnalysis ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Activity
                        className={`w-4 h-4 ${
                          previewAnalysis.score >= 40 ? "text-emerald-400" : "text-amber-400"
                        }`}
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Diagnóstico de Confiança
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        previewAnalysis.score >= 65
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : previewAnalysis.score >= 40
                          ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      Confiança: {Math.round(previewAnalysis.score)}%
                    </span>
                  </div>

                  {/* Barra de progresso de Confiança */}
                  <div className="w-full h-1.5 rounded-sm bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all duration-500 ${
                        previewAnalysis.score >= 40 ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.max(8, Math.min(100, previewAnalysis.score))}%` }}
                    />
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-slate-300 leading-snug">
                    {previewAnalysis.lowQuality && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span>{previewAnalysis.feedback}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Botões Diretos: Refazer ou Salvar no Dataset */}
          <div
            className="flex gap-2.5 px-3 py-3 bg-slate-900/95 border-t border-white/10 max-w-lg mx-auto w-full"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-semibold text-xs sm:text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Tirar Outra
            </button>
            <button
              onClick={handleSave}
              disabled={scoringPreview}
              className="flex-1 btn-primary py-3 rounded-lg text-xs sm:text-sm"
            >
              <Check className="w-4 h-4" />
              Salvar no Dataset
            </button>
          </div>
        </div>
      )}

      {/* ── MODO UPLOADING ── */}
      {screen === "uploading" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-4 max-w-xs w-full text-center shadow-2xl">
            <RefreshCcw className="w-10 h-10 animate-spin text-emerald-400" />
            <div>
              <p className="text-white font-extrabold text-base">Enviando para o dataset…</p>
              <p className="text-slate-400 text-xs mt-1">
                Sincronizando imagem otimizada com o armazenamento em nuvem
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
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-3 bg-slate-950 text-white/60 text-sm">
          <RefreshCcw className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Preparando câmera…</span>
        </div>
      }
    >
      <CameraContent />
    </Suspense>
  );
}
