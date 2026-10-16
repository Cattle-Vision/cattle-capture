"use client";

/**
 * Câmera Guiada e Upload Otimizado para Dataset ICC (`src/app/camera/page.tsx`).
 *
 * Correções Críticas de Engenharia para Vercel:
 * 1. **Compressão Client-Side Obrigatória (`compressImageFile`)**:
 *    Tanto o disparo pelo streaming de vídeo quanto o envio pela Câmera Nativa / Galeria
 *    passam pelo pipeline Canvas JPEG (`máx 1600px, quality 0.86`), reduzindo arquivos de
 *    5–15 MB para ~180–400 KB. Isso elimina 100% dos erros `413 FUNCTION_PAYLOAD_TOO_LARGE`
 *    nas Serverless Functions da Vercel.
 * 2. **Dupla Entrada de Arquivo (Câmera Nativa + Galeria)**:
 *    Oferece botões dedicados para abrir a câmera nativa do celular (`capture="environment"`)
 *    ou escolher uma imagem existente na galeria/computador (sem `capture`).
 * 3. **Fallback Offline Automático (`enqueueSync`)**:
 *    Se o operador estiver sem sinal no curral, armazena a imagem comprimida no IndexedDB
 *    para sincronização automática assim que a conexão retornar.
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
} from "lucide-react";
import { compressImageFile, formatBytes } from "@/lib/image-client";
import { enqueueSync } from "@/lib/sync";

type Screen = "viewfinder" | "preview" | "uploading" | "done" | "error";

const CHECKLIST = [
  "Animal posicionado de frente para a traseira (1m a 1,5m)",
  "Garupa, ísquios (pinças) e inserção da cauda visíveis",
  "Boa iluminação e sem obstáculos cobrindo o lombo",
];

async function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const MAX = 1600;
    let w = vw;
    let h = vh;
    if (w > MAX || h > MAX) {
      if (w > h) {
        h = Math.round((h * MAX) / w);
        w = MAX;
      } else {
        w = Math.round((w * MAX) / h);
        h = MAX;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86)
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
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCamRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const previewRef = useRef<string>("");

  const [screen, setScreen] = useState<Screen>("viewfinder");
  const [animalName, setAnimalName] = useState(paramName);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageMeta, setImageMeta] = useState("");
  const [checks, setChecks] = useState([true, true, true]);
  const [camErr, setCamErr] = useState("");
  const [vidReady, setVidReady] = useState(false);
  const [lowQuality, setLowQuality] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  useEffect(() => {
    if (!animalId || animalName) return;
    fetch(`/api/animals/${animalId}`)
      .then((r) => (r.ok ? r.json() : null))
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

    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamErr("Câmera ao vivo indisponível neste navegador. Use a Câmera do Aparelho ou Galeria abaixo.");
        return;
      }

      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];

      let lastErr: unknown;
      for (const c of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c);
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = s;
          const v = videoRef.current;
          if (!v) return;
          v.srcObject = s;
          v.muted = true;
          v.playsInline = true;
          await v.play().catch(() => {});
          setCamErr("");
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!cancelled) {
        console.warn("Camera stream fallback:", lastErr);
        setCamErr(
          "Permissão de vídeo negada ou câmera não detectada. Use a Câmera Nativa ou envie da Galeria."
        );
      }
    })();

    const timer = setTimeout(() => {
      if (!cancelled && !videoRef.current?.videoWidth) {
        setCamErr((e) => e || "Câmera demorou a responder. Use os botões de Câmera Nativa ou Galeria.");
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [animalId]);

  useEffect(() => {
    return () => {
      if (previewRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  /* ── Captura do frame de vídeo ao vivo ── */
  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !vidReady) {
      setCamErr("Aguarde a inicialização da câmera ou use o botão de arquivo.");
      return;
    }

    const result = await captureVideoFrame(video, canvas);
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
    setChecks([true, true, true]);
    setScreen("preview");
  };

  /* ── Captura via Câmera Nativa ou Galeria (com compressão automática!) ── */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Comprime para JPEG <= 1600px (~200KB) para evitar erro 413 na Vercel
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
    setChecks([true, true, true]);
    setScreen("preview");

    if (nativeCamRef.current) nativeCamRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  /* ── Envio para `/api/upload` com fallback offline ── */
  const handleSave = async () => {
    const blob = blobRef.current;
    if (!blob || !animalId || !checks.every(Boolean)) return;

    setScreen("uploading");
    setUploadErr("");
    setSavedOffline(false);

    const fileName = `rear_${animalId}_${Date.now()}.jpg`;
    const fd = new FormData();
    fd.append("file", blob, fileName);
    fd.append("animalId", animalId);
    fd.append("view", "REAR");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setLowQuality(data.lowQuality === true);
        setAiScore(typeof data.score === "number" ? data.score : null);
        setScreen("done");
        return;
      }

      console.error("Upload error:", data);
      setUploadErr(data.error || `Falha no envio (HTTP ${res.status}). Tente novamente.`);
      setScreen("error");
    } catch (err) {
      console.error("Network error:", err);
      // Se estiver offline, salva na fila IndexedDB
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
          // Segue para tela de erro padrão
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
    setLowQuality(false);
    setAiScore(null);
    setSavedOffline(false);
    setUploadErr("");
    setScreen("viewfinder");
  };

  /* ── Tela de Sucesso ── */
  if (screen === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6 bg-slate-950 text-white">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl ${
            savedOffline
              ? "bg-amber-500"
              : lowQuality
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
            {savedOffline ? "Salva na fila offline!" : "Captura registrada!"}
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            {savedOffline ? (
              <>
                A imagem de <strong className="text-white">{animalName || "animal"}</strong> será
                sincronizada automaticamente assim que a internet voltar.
              </>
            ) : (
              <>
                Imagem posterior de{" "}
                <strong className="text-white">{animalName || "animal"}</strong> otimizada e salva
                no dataset de ICC.
              </>
            )}
          </p>

          {aiScore !== null && !savedOffline && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Score de Confiança IA: {Math.round(aiScore)}%
            </div>
          )}

          {lowQuality && (
            <div className="mt-4 text-left rounded-2xl p-4 flex gap-3 bg-amber-950/60 border border-amber-700/60">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 font-bold text-sm">Atenção ao enquadramento</p>
                <p className="text-amber-200/80 text-xs mt-1 leading-relaxed">
                  A foto foi salva no dataset, mas o detector IA indicou baixa confiança para
                  traseira bovina. Caso necessário, capture mais um ângulo.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="btn-primary w-full py-4 text-sm"
          >
            Ver Galeria do Animal
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold text-white transition"
          >
            Capturar Outra Foto
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

  /* ── Viewfinder + Preview + Uploading ── */
  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 overflow-hidden select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Input 1: Câmera nativa do celular (traseira) */}
      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {/* Input 2: Galeria de fotos / computador */}
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
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(2,6,23,0.85) 0%, transparent 100%)",
          display: screen === "uploading" ? "none" : "flex",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="text-center">
          <p className="text-white font-extrabold text-sm truncate max-w-[180px]">
            {animalName || "Captura Guiada"}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Vista Posterior · ICC
          </p>
        </div>

        <button
          onClick={() => galleryRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold"
          title="Escolher da galeria"
        >
          <Upload className="w-3.5 h-3.5" />
          Galeria
        </button>
      </div>

      {/* ── MODO VIEWFINDER ── */}
      {screen === "viewfinder" && (
        <>
          {/* Guia Anatômico de Enquadramento */}
          {!camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-6">
              <div className="relative w-[74%] max-w-[290px] aspect-[3/4] rounded-3xl border-2 border-white/25 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]">
                {/* Cantoneiras Esmeralda */}
                <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
                <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
                <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
                <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />

                {/* Silhueta guia central */}
                <svg
                  viewBox="0 0 200 260"
                  className="w-full h-full opacity-35"
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                >
                  {/* Linha central da coluna/cauda */}
                  <line x1="100" y1="35" x2="100" y2="225" />
                  {/* Contorno referencial de garupa e ísquios */}
                  <path d="M50 75 Q100 50 150 75 L160 185 Q100 200 40 185 Z" />
                </svg>

                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-950/85 border border-emerald-500/30 text-emerald-300 text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap backdrop-blur-md">
                  Centralize garupa, pinças e cauda (1m)
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
              onClick={() => nativeCamRef.current?.click()}
              className="flex flex-col items-center gap-1 text-white/80 hover:text-white"
              aria-label="Câmera nativa"
            >
              <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold">Nativa</span>
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

      {/* ── MODO PREVIEW & CHECKLIST ── */}
      {screen === "preview" && previewUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-slate-950">
          <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
            <img
              src={previewUrl}
              alt="Preview da captura"
              className="max-w-full max-h-full object-contain rounded-2xl border border-white/10 shadow-2xl"
            />
            {imageMeta && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-white/10 text-emerald-300 text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur-md">
                ✓ {imageMeta} · Pronta para envio
              </div>
            )}
          </div>

          {/* Checklist de Validação */}
          <div className="px-4 pb-3 space-y-2 max-w-lg mx-auto w-full">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Verificação de Qualidade do Dataset
            </p>
            {CHECKLIST.map((item, i) => (
              <label
                key={item}
                className="flex items-center gap-3 text-xs sm:text-sm text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-2.5 cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={(e) =>
                    setChecks((p) => p.map((v, idx) => (idx === i ? e.target.checked : v)))
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>

          {/* Ações de Confirmação */}
          <div
            className="flex gap-3 px-4 py-4 bg-slate-900/95 border-t border-white/10"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-white font-bold text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Refazer
            </button>
            <button
              onClick={handleSave}
              disabled={!checks.every(Boolean)}
              className="flex-1 btn-primary py-4 rounded-2xl text-sm disabled:opacity-40"
            >
              <Check className="w-5 h-5" />
              Confirmar e Salvar
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
              <p className="text-white font-extrabold text-base">Processando e salvando…</p>
              <p className="text-slate-400 text-xs mt-1">
                Validando com IA e sincronizando no armazenamento da nuvem
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
