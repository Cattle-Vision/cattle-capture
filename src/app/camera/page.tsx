"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, RefreshCcw, RotateCcw, Check, X, ArrowLeft, ImagePlus, AlertCircle } from "lucide-react";
import { enqueueSync } from "@/lib/sync";

type CaptureState = "viewfinder" | "preview" | "uploading" | "done" | "error";

const CHECKLIST = [
  "Animal parado, visto de trás",
  "Garupa, pinças e cauda visíveis",
  "Sem pessoas, cerca ou sombra cobrindo o lombo",
];

async function blobFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Blob | null> {
  try {
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const maxDim = 1920;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
      } catch {
        resolve(null);
      }
    });
  } catch (err) {
    console.error("Camera capture error:", err);
    return null;
  }
}

function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId = searchParams.get("animalId");
  const paramName = searchParams.get("animalName");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<CaptureState>("viewfinder");
  const [animalName, setAnimalName] = useState(paramName || "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const [aiScore, setAiScore] = useState<number | null>(null);

  useEffect(() => {
    if (!animalId || animalName) return;
    fetch(`/api/animals/${animalId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.name || data?.tag) setAnimalName(data.name || data.tag);
      })
      .catch(() => {});
  }, [animalId, animalName]);

  const clearPreviewUrl = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreamActive(false);
    setVideoReady(false);
  }, []);

  useEffect(() => {
    if (!animalId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCameraError("Animal não especificado. Volte e identifique pelo brinco.");
      return;
    }

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Use o botão abaixo para abrir a câmera do aparelho.");
        return;
      }

      const attempts: MediaStreamConstraints[] = [
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { audio: false, video: { facingMode: "environment" } },
        { audio: false, video: true },
      ];

      let lastError: unknown = null;
      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => {});
          setStreamActive(true);
          setCameraError(null);
          return;
        } catch (err) {
          lastError = err;
        }
      }

      console.warn("[Camera] getUserMedia falhou:", lastError);
      setCameraError("Não foi possível usar a câmera no navegador. Abra a câmera nativa abaixo.");
    }

    startCamera();
    const timeout = window.setTimeout(() => {
      if (!cancelled && !videoRef.current?.videoWidth) {
        setCameraError((prev) => prev ?? "A prévia travou. Use a câmera do aparelho.");
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      stopStream();
    };
  }, [animalId, stopStream]);

  const captureFromVideo = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) {
      setCameraError("A câmera ainda não está pronta.");
      return;
    }
    const blob = await blobFromVideo(video, canvas);
    if (!blob) {
      setCameraError("Falha ao processar a imagem da câmera. Tente usar a câmera do aparelho.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
    clearPreviewUrl();
    setCapturedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setChecks([false, false, false]);
    setState("preview");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearPreviewUrl();
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setChecks([false, false, false]);
    setState("preview");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmUpload = async () => {
    if (!capturedBlob || !animalId) return;
    if (!checks.every(Boolean)) return;
    setState("uploading");

    const fileName = `rear_${animalId}_${Date.now()}.jpg`;
    const form = new FormData();
    form.append("file", capturedBlob, fileName);
    form.append("animalId", animalId);
    form.append("view", "REAR");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setAiScore(data.score ?? null);
        setState("done");
        return;
      }
      throw new Error("upload");
    } catch {
      try {
        const buffer = await capturedBlob.arrayBuffer();
        await enqueueSync("/api/upload", "POST", { file: buffer, fileName, animalId }, true);
        setState("done");
      } catch {
        setState("error");
      }
    }
  };

  const retake = () => {
    clearPreviewUrl();
    setCapturedBlob(null);
    setAiScore(null);
    setState("viewfinder");
  };

  useEffect(() => () => clearPreviewUrl(), [clearPreviewUrl]);

  if (!animalId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-zinc-950 text-white gap-4 px-6">
        <p className="text-sm text-zinc-300 text-center">Identifique o animal pelo brinco antes de fotografar.</p>
        <button
          onClick={() => router.push("/identify")}
          className="px-5 py-3 rounded-2xl bg-emerald-600 font-semibold"
        >
          Ir para identificador
        </button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-zinc-950 text-white gap-6 px-6">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center">
          <Check className="w-10 h-10 text-white stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-2xl font-bold mb-1.5">Traseira salva</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Imagem de <strong className="text-white">{animalName || "animal"}</strong> no dataset de ICC.
          </p>
          {aiScore !== null && (
            <div className="inline-flex items-center gap-2 bg-emerald-900/40 text-emerald-300 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-800/50">
              Score IA: <span className="text-white">{aiScore.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs pt-2">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="w-full py-4 bg-emerald-600 rounded-2xl font-semibold"
          >
            Ver galeria
          </button>
          <button onClick={retake} className="w-full py-3.5 bg-zinc-800 rounded-2xl text-sm">
            Tirar outra foto
          </button>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-zinc-950 text-white gap-6 px-6">
        <div className="w-20 h-20 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full flex items-center justify-center">
          <X className="w-10 h-10 stroke-[2.5]" />
        </div>
        <p className="text-zinc-400 text-sm text-center">Não foi possível enviar a imagem.</p>
        <button onClick={retake} className="w-full max-w-xs py-4 bg-zinc-800 rounded-2xl">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden select-none flex flex-col justify-between">
      <canvas ref={canvasRef} className="opacity-0 absolute -z-10 pointer-events-none" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {state === "preview" && previewUrl && (
        <div className="absolute inset-0 flex flex-col z-30 bg-black">
          <div className="p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
            <span className="text-white font-medium text-sm">Confirme a traseira</span>
            <span className="text-zinc-400 text-xs">{animalName || "Animal"}</span>
          </div>
          <div className="flex-1 relative flex items-center justify-center p-2 overflow-hidden">
            <img src={previewUrl} alt="Pré-visualização" className="max-w-full max-h-full object-contain rounded-xl" />
          </div>
          <div className="px-5 pb-3 space-y-2">
            {CHECKLIST.map((item, i) => (
              <label key={item} className="flex items-center gap-3 text-sm text-white bg-white/10 rounded-xl px-3 py-2">
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={(e) => setChecks((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))}
                  className="w-4 h-4 accent-emerald-500"
                />
                {item}
              </label>
            ))}
          </div>
          <div className="flex gap-3 p-5 bg-zinc-950/90 border-t border-zinc-800" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            <button onClick={retake} className="flex-1 flex items-center justify-center gap-2 py-4 bg-zinc-800 rounded-2xl text-white font-medium">
              <RotateCcw className="w-5 h-5" />
              Outra
            </button>
            <button
              onClick={confirmUpload}
              disabled={!checks.every(Boolean)}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 disabled:bg-zinc-700 rounded-2xl text-white font-semibold"
            >
              <Check className="w-5 h-5" />
              Salvar
            </button>
          </div>
        </div>
      )}

      {state === "uploading" && (
        <div className="absolute inset-0 flex z-30 bg-black/90 items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center gap-4 max-w-xs text-center">
            <RefreshCcw className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-white font-semibold">Salvando no dataset</p>
          </div>
        </div>
      )}

      <div className="w-full px-4 py-3.5 flex items-center justify-between z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <button onClick={() => router.back()} className="text-white text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="text-center min-w-0 px-2">
          <h1 className="text-white font-bold text-sm truncate max-w-[200px]">{animalName || "Câmera"}</h1>
          <p className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">Traseira · ICC</p>
        </div>
        <button onClick={() => fileInputRef.current?.click()} className="text-white p-2 rounded-xl bg-white/10" aria-label="Câmera nativa">
          <ImagePlus className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={() => setVideoReady(true)}
          onPlaying={() => setVideoReady(true)}
          className="w-full h-full object-cover"
        />
        {!videoReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
            Abrindo câmera…
          </div>
        )}
      </div>

      {streamActive && state === "viewfinder" && !cameraError && (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
          <div className="relative w-[72%] max-w-xs aspect-[3/4] rounded-2xl border-2 border-white/50">
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
            <svg viewBox="0 0 120 160" className="absolute inset-4 opacity-70">
              <ellipse cx="60" cy="42" rx="28" ry="18" fill="none" stroke="white" strokeWidth="2" />
              <path d="M40 58 L36 118 L84 118 L80 58" fill="none" stroke="white" strokeWidth="2" />
              <path d="M60 42 L60 22" stroke="white" strokeWidth="2" />
              <text x="60" y="148" textAnchor="middle" fill="white" fontSize="10">
                traseira
              </text>
            </svg>
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black/60 text-white/90 text-xs px-3 py-1 rounded-full whitespace-nowrap">
              Enquadre garupa e pinças
            </div>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-zinc-950/90 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <AlertCircle className="w-8 h-8" />
          </div>
          <p className="text-zinc-300 text-sm max-w-xs">{cameraError}</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-semibold"
          >
            <Camera className="w-5 h-5" />
            Abrir câmera do aparelho
          </button>
        </div>
      )}

      {streamActive && state === "viewfinder" && !cameraError && (
        <div className="w-full z-20 flex items-center justify-around pb-8 pt-4 bg-gradient-to-t from-black/85 to-transparent" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
          <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center" aria-label="Câmera nativa">
            <ImagePlus className="w-5 h-5" />
          </button>
          <button
            onClick={captureFromVideo}
            disabled={!videoReady}
            aria-label="Disparar captura"
            className="relative w-20 h-20 rounded-full border-[4px] border-white bg-white/20 flex items-center justify-center active:scale-90 disabled:opacity-50 disabled:active:scale-100"
          >
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
              <Camera className="w-7 h-7 text-zinc-900" />
            </div>
          </button>
          <div className="w-12 h-12" />
        </div>
      )}
    </div>
  );
}

export default function CameraPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center text-white/60 text-sm gap-3">
          <RefreshCcw className="w-6 h-6 animate-spin text-emerald-500" />
          <span>Iniciando câmera...</span>
        </div>
      }
    >
      <CameraContent />
    </Suspense>
  );
}
