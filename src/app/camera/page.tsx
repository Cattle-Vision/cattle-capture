"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera, RefreshCcw, RotateCcw, Check, X,
  ArrowLeft, ImagePlus, AlertCircle, AlertTriangle,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Tipos
──────────────────────────────────────────────────────────── */
type Screen = "viewfinder" | "preview" | "uploading" | "done" | "error";

const CHECKLIST = [
  "Animal parado, visto de trás",
  "Garupa, pinças e cauda visíveis",
  "Sem sombra ou cerca cobrindo o lombo",
];

/* ────────────────────────────────────────────────────────────
   Captura do frame do vídeo → Blob JPEG
──────────────────────────────────────────────────────────── */
async function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<Blob | null> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const MAX = 1920;
    let w = vw, h = vh;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
      else       { w = Math.round((w * MAX) / h); h = MAX; }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────
   Componente principal
──────────────────────────────────────────────────────────── */
function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId   = searchParams.get("animalId") ?? "";
  const paramName  = searchParams.get("animalName") ?? "";

  /* refs — não causam re-render desnecessário */
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const blobRef     = useRef<Blob | null>(null);   // blob capturado (não estado)
  const previewRef  = useRef<string>("");           // object URL de preview (não estado)

  /* estado da tela */
  const [screen,     setScreen]     = useState<Screen>("viewfinder");
  const [animalName, setAnimalName] = useState(paramName);
  const [previewUrl, setPreviewUrl] = useState("");
  const [checks,     setChecks]     = useState([false, false, false]);
  const [camErr,     setCamErr]     = useState("");
  const [vidReady,   setVidReady]   = useState(false);
  const [lowQuality, setLowQuality] = useState(false);
  const [uploadErr,  setUploadErr]  = useState("");

  /* busca nome do animal se não veio na URL */
  useEffect(() => {
    if (!animalId || animalName) return;
    fetch(`/api/animals/${animalId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name || d?.tag) setAnimalName(d.name || d.tag); })
      .catch(() => {});
  }, [animalId, animalName]);

  /* inicia câmera */
  useEffect(() => {
    if (!animalId) {
      setCamErr("Animal não especificado. Volte e identifique pelo brinco.");
      return;
    }

    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamErr("Use o botão 📷 para abrir a câmera do aparelho.");
        return;
      }

      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];

      let lastErr: unknown;
      for (const c of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c);
          if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = s;
          const v = videoRef.current;
          if (!v) return;
          v.srcObject = s;
          v.muted = true;
          v.playsInline = true;
          await v.play().catch(() => {});
          setCamErr("");
          return;
        } catch (e) { lastErr = e; }
      }
      if (!cancelled) {
        console.warn("Camera failed:", lastErr);
        setCamErr("Câmera não disponível no navegador. Use o botão 📷 abaixo.");
      }
    })();

    const timer = setTimeout(() => {
      if (!cancelled && !videoRef.current?.videoWidth) {
        setCamErr(e => e || "Câmera demorou a carregar. Use o botão 📷.");
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [animalId]);

  /* limpa object URL ao desmontar */
  useEffect(() => {
    return () => {
      if (previewRef.current.startsWith("blob:")) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  /* ── Captura do vídeo ── */
  const handleCapture = async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !vidReady) {
      setCamErr("Câmera não está pronta. Aguarde.");
      return;
    }

    const blob = await captureFrame(video, canvas);
    if (!blob) {
      setCamErr("Falha ao capturar imagem. Tente o botão 📷.");
      return;
    }

    /* revogar URL anterior */
    if (previewRef.current.startsWith("blob:")) URL.revokeObjectURL(previewRef.current);

    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    previewRef.current = url;

    navigator.vibrate?.(40);
    setPreviewUrl(url);
    setChecks([false, false, false]);
    setScreen("preview");
  };

  /* ── Arquivo do sistema (câmera nativa) ── */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewRef.current.startsWith("blob:")) URL.revokeObjectURL(previewRef.current);

    blobRef.current = file;
    const url = URL.createObjectURL(file);
    previewRef.current = url;

    setPreviewUrl(url);
    setChecks([false, false, false]);
    setScreen("preview");
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ── Upload ── */
  const handleSave = async () => {
    const blob = blobRef.current;
    if (!blob || !animalId || !checks.every(Boolean)) return;

    setScreen("uploading");
    setUploadErr("");

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
        setScreen("done");
        return;
      }

      /* falha com mensagem do servidor */
      console.error("Upload error:", data);
      setUploadErr(data.error || "Falha no upload. Tente novamente.");
      setScreen("error");
    } catch (err) {
      console.error("Network error:", err);
      setUploadErr("Sem conexão. Verifique a internet e tente novamente.");
      setScreen("error");
    }
  };

  /* ── Refazer ── */
  const retake = () => {
    blobRef.current = null;
    if (previewRef.current.startsWith("blob:")) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPreviewUrl("");
    setLowQuality(false);
    setUploadErr("");
    setScreen("viewfinder");
  };

  /* ──────────────────────────────────────────────────────────
     Telas de resultado
  ────────────────────────────────────────────────────────── */
  if (screen === "done") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6"
        style={{ background: "#111" }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: lowQuality ? "#D97706" : "#DB2777" }}
        >
          <Check className="w-10 h-10 text-white stroke-[3]" />
        </div>

        <div className="text-center max-w-xs">
          <h2 className="text-2xl font-bold text-white mb-2">Traseira salva!</h2>
          <p className="text-zinc-400 text-sm">
            Imagem de{" "}
            <strong className="text-white">{animalName || "animal"}</strong>{" "}
            adicionada ao dataset de ICC.
          </p>

          {lowQuality && (
            <div
              className="mt-4 text-left rounded-xl p-3.5 flex gap-3"
              style={{ background: "#451a03", border: "1px solid #92400E" }}
            >
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 font-bold text-sm">Qualidade baixa</p>
                <p className="text-amber-400/75 text-xs mt-1 leading-relaxed">
                  A foto foi salva, mas a IA detectou baixa confiança de traseira bovina.
                  Considere refazer com melhor enquadramento.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="w-full py-4 rounded-xl font-bold text-white"
            style={{ background: "#DB2777" }}
          >
            Ver galeria do animal
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-zinc-800 rounded-xl text-sm font-semibold text-white"
          >
            Tirar outra foto
          </button>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[100dvh] px-6 gap-6"
        style={{ background: "#111" }}
      >
        <div className="w-20 h-20 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center">
          <X className="w-10 h-10 text-red-400 stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-xl font-bold text-white mb-2">Falha no envio</h2>
          <p className="text-zinc-400 text-sm">{uploadErr || "Não foi possível enviar a imagem."}</p>
        </div>
        <button onClick={retake} className="w-full max-w-xs py-4 bg-zinc-800 rounded-xl text-white font-semibold">
          Tentar novamente
        </button>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────
     Viewfinder + Preview + Uploading (mesma tela, full-screen)
  ────────────────────────────────────────────────────────── */
  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden select-none">
      {/* canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {/* input de arquivo oculto */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {/* ── VÍDEO (fundo) ── */}
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

      {/* ── TOPO (header) ── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)",
          display: (screen === "uploading") ? "none" : "flex",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="text-center">
          <p className="text-white font-bold text-sm truncate max-w-[180px]">{animalName || "Câmera"}</p>
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "#F472B6" }}
          >
            Traseira · ICC
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-xl bg-white/10 text-white"
          aria-label="Câmera nativa"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
      </div>

      {/* ── VIEWFINDER ── */}
      {screen === "viewfinder" && (
        <>
          {/* guia de enquadramento */}
          {!camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="relative w-[70%] max-w-[280px] aspect-[3/4] rounded-2xl border-2 border-white/30">
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-[3px] border-l-[3px] border-pink-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-[3px] border-r-[3px] border-pink-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-[3px] border-l-[3px] border-pink-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-[3px] border-r-[3px] border-pink-400 rounded-br-lg" />
                <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-black/60 text-white/80 text-xs px-3 py-1 rounded-full whitespace-nowrap">
                  Enquadre garupa e pinças
                </div>
              </div>
            </div>
          )}

          {/* loading da câmera */}
          {!vidReady && !camErr && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/60 text-sm">
                <RefreshCcw className="w-6 h-6 animate-spin" />
                <span>Abrindo câmera…</span>
              </div>
            </div>
          )}

          {/* erro de câmera */}
          {camErr && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "rgba(0,0,0,0.9)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(236,72,153,0.2)", border: "1px solid rgba(236,72,153,0.4)" }}>
                <AlertCircle className="w-8 h-8" style={{ color: "#F472B6" }} />
              </div>
              <p className="text-zinc-300 text-sm max-w-xs">{camErr}</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold text-white"
                style={{ background: "#DB2777" }}
              >
                <Camera className="w-5 h-5" />
                Abrir câmera do aparelho
              </button>
            </div>
          )}

          {/* botão de disparo */}
          <div
            className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-around py-8"
            style={{
              paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
              background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
            }}
          >
            <button
              onClick={() => fileRef.current?.click()}
              className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center"
              aria-label="Câmera nativa"
            >
              <ImagePlus className="w-5 h-5" />
            </button>

            <button
              onClick={handleCapture}
              disabled={!vidReady || !!camErr}
              aria-label="Capturar foto"
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 disabled:opacity-40 transition-transform"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "#fff" }}
              >
                <Camera className="w-7 h-7 text-zinc-900" />
              </div>
            </button>

            <div className="w-12 h-12" aria-hidden />
          </div>
        </>
      )}

      {/* ── PREVIEW ── */}
      {screen === "preview" && previewUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-black">
          {/* imagem */}
          <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>

          {/* checklist */}
          <div className="px-4 pb-3 space-y-2">
            {CHECKLIST.map((item, i) => (
              <label
                key={item}
                className="flex items-center gap-3 text-sm text-white bg-white/10 rounded-xl px-3 py-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={(e) =>
                    setChecks((p) => p.map((v, idx) => (idx === i ? e.target.checked : v)))
                  }
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "#DB2777" }}
                />
                {item}
              </label>
            ))}
          </div>

          {/* ações */}
          <div
            className="flex gap-3 px-4 py-4 bg-zinc-950/90 border-t border-zinc-800"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-zinc-800 rounded-2xl text-white font-semibold"
            >
              <RotateCcw className="w-5 h-5" />
              Outra
            </button>
            <button
              onClick={handleSave}
              disabled={!checks.every(Boolean)}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold disabled:opacity-40 disabled:bg-zinc-700"
              style={checks.every(Boolean) ? { background: "#DB2777" } : {}}
            >
              <Check className="w-5 h-5" />
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* ── UPLOADING ── */}
      {screen === "uploading" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center gap-4 max-w-xs text-center">
            <RefreshCcw className="w-10 h-10 animate-spin" style={{ color: "#DB2777" }} />
            <p className="text-white font-semibold">Salvando no dataset…</p>
            <p className="text-zinc-500 text-xs">Não feche a tela</p>
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
        <div
          className="h-[100dvh] flex flex-col items-center justify-center gap-3"
          style={{ background: "#111", color: "rgba(255,255,255,0.5)", fontSize: 14 }}
        >
          <RefreshCcw className="w-6 h-6 animate-spin" style={{ color: "#DB2777" }} />
          <span>Iniciando câmera…</span>
        </div>
      }
    >
      <CameraContent />
    </Suspense>
  );
}
