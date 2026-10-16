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
  VisionScoreResult,
} from "@/lib/vision-client";
import { enqueueSync } from "@/lib/sync";

type Screen = "viewfinder" | "preview" | "uploading" | "done" | "error";

async function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxDim = 1600,
  quality = 0.86
): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    let w = vw;
    let h = vh;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return null;
    return { blob, width: w, height: h };
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
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCamRef = useRef<HTMLInputElement>(null);
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

    const interval = setInterval(async () => {
      if (!active) return;
      const video = videoRef.current;
      const scratch = scratchCanvasRef.current;
      if (!video || !scratch || !video.videoWidth) return;

      // 1. Análise óptica instantânea a cada 400ms
      const instant = computeInstantVideoScore(video, scratch);
      if (instant && active) {
        setLiveScore((prev) =>
          prev === null ? instant.score : Math.round(prev * 0.4 + instant.score * 0.6)
        );
        setLiveStatus(instant.statusText);
      }

      // 2. A cada ~2.0s (5 ticks), consulta a inferência IA no servidor em background
      tickCount++;
      if (tickCount % 5 === 0 && !inFlightServerCheck && navigator.onLine) {
        inFlightServerCheck = true;
        try {
          const miniFrame = await captureVideoFrame(video, scratch, 320, 0.72);
          if (miniFrame && active) {
            const aiRes = await evaluatePhotoScoreBeforeUpload(miniFrame.blob);
            if (active && typeof aiRes.score === "number") {
              setLiveScore(Math.round(aiRes.score));
              setLiveStatus(
                aiRes.score >= 65
                  ? "IA: Traseira bem enquadrada"
                  : aiRes.score >= 40
                  ? "IA: Enquadramento aceitável"
                  : "IA: Centralize a garupa (1m)"
              );
            }
          }
        } catch {
          // ignora erro silenciosamente no loop live
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

    const result = await captureVideoFrame(video, canvas, 1600, 0.86);
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

    const compressed = await compressImageFile(file, 1600, 0.86);

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

    if (nativeCamRef.current) nativeCamRef.current.value = "";
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
              className={`mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold border ${
                finalScore >= 40
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-300 border-amber-500/30"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Score IA Registrado: {Math.round(finalScore)}%
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

      {/* Input 1: Câmera nativa do aparelho */}
      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {/* Input 2: Galeria de fotos / arquivo */}
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
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 gap-2"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(2,6,23,0.85) 0%, transparent 100%)",
          display: screen === "uploading" ? "none" : "flex",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold shrink-0"
          title="Voltar"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Voltar</span>
        </button>

        <div className="text-center min-w-0 px-1">
          <p className="text-white font-extrabold text-xs sm:text-sm truncate max-w-[130px] xs:max-w-[170px] sm:max-w-[220px]">
            {animalName || "Captura Guiada"}
          </p>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-400 truncate">
            Vista Posterior · ICC
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSwitchCamera}
            disabled={switchingCamera}
            className="flex items-center gap-1 p-2 sm:px-3 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold"
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
            className="flex items-center gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold shrink-0"
            title="Escolher da galeria"
            aria-label="Escolher da galeria"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden xs:inline">Galeria</span>
          </button>
        </div>
      </div>

      {/* ── MODO VIEWFINDER COM SCORE EM TEMPO REAL ── */}
      {screen === "viewfinder" && (
        <>
          {!camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
              <div
                className={`relative w-[74%] max-w-[290px] aspect-[3/4] rounded-3xl border-2 transition-colors duration-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.48)] ${
                  isLiveGood ? "border-emerald-400/50" : "border-white/25"
                }`}
              >
                {/* Badge de Score IA em Tempo Real no Topo do Guia */}
                {vidReady && liveScore !== null && (
                  <div
                    className={`absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap backdrop-blur-md border transition-colors ${
                      isLiveGood
                        ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50"
                        : "bg-slate-900/90 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    <span>Score Tempo Real: {liveScore}%</span>
                  </div>
                )}

                {/* Cantoneiras Dinâmicas */}
                <div
                  className={`absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 rounded-tl-2xl transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 rounded-tr-2xl transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 rounded-bl-2xl transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 rounded-br-2xl transition-colors ${
                    isLiveGood ? "border-emerald-400" : "border-amber-400"
                  }`}
                />

                {/* Silhueta guia central */}
                <svg
                  viewBox="0 0 200 260"
                  className="w-full h-full opacity-35"
                  fill="none"
                  stroke={isLiveGood ? "#34D399" : "#FBBF24"}
                  strokeWidth="2"
                  strokeDasharray="6 6"
                >
                  <line x1="100" y1="35" x2="100" y2="225" />
                  <path d="M50 75 Q100 50 150 75 L160 185 Q100 200 40 185 Z" />
                </svg>

                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-white/15 text-white/90 text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap backdrop-blur-md">
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
                  Modo de Captura Direta
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">{camErr}</p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => nativeCamRef.current?.click()}
                  className="btn-primary w-full py-4 text-sm"
                >
                  <Camera className="w-5 h-5" />
                  Abrir Câmera do Aparelho
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="w-full py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
                >
                  <ImagePlus className="w-4 h-4" />
                  Selecionar Foto da Galeria
                </button>
              </div>
            </div>
          )}

          {/* Controles de Disparo */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-around py-7 px-6"
            style={{
              paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(2,6,23,0.9) 0%, transparent 100%)",
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
              <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/10">
                <SwitchCamera className={`w-5 h-5 ${switchingCamera ? "animate-spin text-emerald-400" : ""}`} />
              </div>
              <span className="text-[10px] font-bold">
                {videoDevices.length > 1 ? `Trocar (${videoDevices.length})` : "Inverter"}
              </span>
            </button>

            <button
              onClick={handleCapture}
              disabled={!vidReady || !!camErr}
              aria-label="Capturar foto"
              className="w-20 h-20 rounded-full border-4 border-emerald-400 flex items-center justify-center active:scale-90 disabled:opacity-35 transition-transform bg-emerald-500/20 shadow-lg shadow-emerald-500/20"
            >
              <div className="w-15 h-15 rounded-full bg-white flex items-center justify-center">
                <Camera className="w-7 h-7 text-slate-900" />
              </div>
            </button>

            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white"
              aria-label="Enviar da galeria"
            >
              <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
                <ImagePlus className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold">Galeria</span>
            </button>
          </div>
        </>
      )}

      {/* ── MODO PREVIEW: EXIBE SCORE IA ANTES DO UPLOAD (SEM CHECKBOXES!) ── */}
      {screen === "preview" && previewUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-950">
          {/* Imagem Capturada */}
          <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
            <img
              src={previewUrl}
              alt="Preview da captura"
              className="max-w-full max-h-full object-contain rounded-2xl border border-white/10 shadow-2xl"
            />
            {imageMeta && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-white/10 text-slate-300 text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur-md">
                {imageMeta}
              </div>
            )}
          </div>

          {/* Card de Diagnóstico IA Pré-Upload */}
          <div className="px-4 pb-3 max-w-lg mx-auto w-full">
            <div className="rounded-2xl bg-slate-900/95 border border-white/10 p-4 backdrop-blur-md">
              {scoringPreview ? (
                <div className="flex items-center gap-3 py-1">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-extrabold text-white">
                      Analisando imagem com IA antes do envio…
                    </p>
                    <p className="text-xs text-slate-400">
                      Verificando enquadramento da traseira e nitidez
                    </p>
                  </div>
                </div>
              ) : previewAnalysis ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className={`w-4 h-4 ${
                          previewAnalysis.score >= 40 ? "text-emerald-400" : "text-amber-400"
                        }`}
                      />
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                        Diagnóstico IA Pré-Upload
                      </span>
                    </div>
                    <span
                      className={`text-sm font-extrabold px-2.5 py-0.5 rounded-full ${
                        previewAnalysis.score >= 65
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : previewAnalysis.score >= 40
                          ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      Score: {Math.round(previewAnalysis.score)}%
                    </span>
                  </div>

                  {/* Barra de progresso do Score */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        previewAnalysis.score >= 40 ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.max(8, Math.min(100, previewAnalysis.score))}%` }}
                    />
                  </div>

                  <div className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                    {previewAnalysis.lowQuality && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <span>{previewAnalysis.feedback}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Botões Diretos: Refazer ou Salvar no Dataset */}
          <div
            className="flex gap-3 px-4 py-4 bg-slate-900/95 border-t border-white/10 max-w-lg mx-auto w-full"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-white font-bold text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Tirar Outra
            </button>
            <button
              onClick={handleSave}
              disabled={scoringPreview}
              className="flex-1 btn-primary py-4 rounded-2xl text-sm"
            >
              <Check className="w-5 h-5" />
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
