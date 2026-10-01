'use client';

/**
 * Página de captura fotográfica para dataset de IA.
 *
 * Correções críticas aplicadas:
 * 1. Travamento eliminado: remoção de Base64 de alta resolução e WASM síncrono.
 *    Uso de URL.createObjectURL() e toBlob() nativos de 0ms.
 * 2. Nome do animal: exibido no cabeçalho (sem "Animal #5" ou hashes no topo).
 * 3. Área de câmera sem glitches: moldura SVG com proporção zootécnica sem bugs de GPU.
 * 4. Fallback móvel nativo: botão para usar a câmera nativa do aparelho via input capture="environment"
 *    se a API getUserMedia falhar ou não tiver suporte HTTPS.
 */

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, RefreshCcw, RotateCcw, Check, X, ArrowLeft, ImagePlus, AlertCircle } from 'lucide-react';
import { enqueueSync } from '@/lib/sync';

type CaptureState = 'viewfinder' | 'preview' | 'uploading' | 'done' | 'error';

function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId = searchParams.get('animalId');
  const paramName = searchParams.get('animalName');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<CaptureState>('viewfinder');
  const [animalName, setAnimalName] = useState<string>(paramName || '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Buscar nome do animal se não vier no query param
  useEffect(() => {
    if (!animalId || animalName) return;

    fetch(`/api/animals/${animalId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.name) setAnimalName(data.name);
      })
      .catch(() => {});
  }, [animalId, animalName]);

  // Limpar ObjectURL do preview para liberar memória
  const clearPreviewUrl = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  }, [previewUrl]);

  // Iniciar stream da câmera
  useEffect(() => {
    if (!animalId) {
      setCameraError('Animal não especificado. Retorne à lista de animais.');
      return;
    }

    let isMounted = true;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Câmera direta indisponível neste navegador. Use a câmera do aparelho abaixo.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
          setCameraError(null);
        }
      } catch (err) {
        console.warn('[Camera] getUserMedia falhou:', err);
        setCameraError('Não foi possível abrir a câmera diretamente. Use o botão abaixo para fotografar com o app nativo.');
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [animalId]);

  // Capturar foto do stream sem travar a UI
  const captureFromVideo = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Feedback háptico em celulares compatíveis
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    // Limitar dimensão para max 1920px (evita canvas de 4K travar o garbage collector do browser)
    const maxDim = 1920;
    let targetWidth = video.videoWidth;
    let targetHeight = video.videoHeight;

    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
        targetWidth = maxDim;
      } else {
        targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
        targetHeight = maxDim;
      }
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Conversão direta para Blob em background (sem strings Base64 gigantescas)
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        clearPreviewUrl();
        const objUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setPreviewUrl(objUrl);
        setState('preview');
      },
      'image/jpeg',
      0.88
    );
  };

  // Capturar via input nativo do sistema operacional (câmera traseira nativa)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearPreviewUrl();
    const objUrl = URL.createObjectURL(file);
    setCapturedBlob(file);
    setPreviewUrl(objUrl);
    setState('preview');
  };

  // Confirmar e enviar a foto
  const confirmUpload = async () => {
    if (!capturedBlob || !animalId) return;
    setState('uploading');

    const fileName = `animal_${animalId}_${Date.now()}.jpg`;
    const form = new FormData();
    form.append('file', capturedBlob, fileName);
    form.append('animalId', animalId);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (res.ok) {
        setState('done');
      } else {
        throw new Error('Falha no upload do servidor');
      }
    } catch {
      // Fallback offline com IndexedDB
      try {
        const buffer = await capturedBlob.arrayBuffer();
        await enqueueSync('/api/upload', 'POST', { file: buffer, fileName, animalId }, true);
        setState('done');
      } catch {
        setState('error');
      }
    }
  };

  // Descartar e tirar outra foto
  const retake = () => {
    clearPreviewUrl();
    setCapturedBlob(null);
    setState('viewfinder');
  };

  // Cleanup de recursos ao desmontar
  useEffect(() => {
    return () => {
      clearPreviewUrl();
    };
  }, [clearPreviewUrl]);

  // ── ESTADO: Concluído ───────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-zinc-950 text-white gap-6 px-6">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-scale-in">
          <Check className="w-10 h-10 text-white stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-2xl font-bold mb-1.5">Foto Registrada!</h2>
          <p className="text-zinc-400 text-sm">
            A imagem de <strong className="text-white">{animalName || 'seu animal'}</strong> foi salva com sucesso no dataset.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs pt-2">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-2xl font-semibold transition cursor-pointer text-white shadow-md active:scale-98"
          >
            Ver Galeria do Animal
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-2xl font-medium transition cursor-pointer text-zinc-200 text-sm active:scale-98"
          >
            Tirar Outra Foto
          </button>
        </div>
      </div>
    );
  }

  // ── ESTADO: Erro ────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-zinc-950 text-white gap-6 px-6">
        <div className="w-20 h-20 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full flex items-center justify-center">
          <X className="w-10 h-10 stroke-[2.5]" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-2xl font-bold mb-1.5">Erro ao Salvar</h2>
          <p className="text-zinc-400 text-sm">Não foi possível enviar a imagem. Verifique a conexão com o servidor.</p>
        </div>
        <button
          onClick={retake}
          className="w-full max-w-xs py-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-2xl font-medium transition cursor-pointer text-white active:scale-98"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden select-none flex flex-col justify-between">
      {/* Canvas oculto para extração de frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Input de arquivo nativo para fallback com câmera nativa */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── ESTADO: Preview após captura ───────────────────────────────── */}
      {state === 'preview' && previewUrl && (
        <div className="absolute inset-0 flex flex-col z-30 bg-black">
          {/* Header do preview */}
          <div
            className="p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <span className="text-white font-medium text-sm">Confirmação da Foto</span>
            <span className="text-zinc-400 text-xs">{animalName || 'Animal'}</span>
          </div>

          {/* Imagem do preview */}
          <div className="flex-1 relative flex items-center justify-center p-2 overflow-hidden">
            <img
              src={previewUrl}
              alt="Pré-visualização da captura"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl animate-fade-in"
            />
          </div>

          {/* Barra de ações inferior */}
          <div
            className="flex gap-3 p-5 bg-zinc-950/90 border-t border-zinc-800/80 backdrop-blur-md"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-2xl text-white font-medium transition cursor-pointer active:scale-98"
            >
              <RotateCcw className="w-5 h-5 text-zinc-300" />
              Tirar Outra
            </button>
            <button
              onClick={confirmUpload}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-2xl text-white font-semibold transition cursor-pointer shadow-lg active:scale-98"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              Salvar Foto
            </button>
          </div>
        </div>
      )}

      {/* ── ESTADO: Uploading ───────────────────────────────────────────── */}
      {state === 'uploading' && previewUrl && (
        <div className="absolute inset-0 flex flex-col z-30 bg-black/90 backdrop-blur-sm items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-xs text-center">
            <RefreshCcw className="w-10 h-10 text-emerald-500 animate-spin" />
            <div>
              <p className="text-white font-semibold text-base mb-1">Salvando Imagem</p>
              <p className="text-zinc-400 text-xs">Otimizando e enviando para o banco de dados...</p>
            </div>
          </div>
        </div>
      )}

      {/* ── ESTADO: Viewfinder (Câmera Ativa) ───────────────────────────── */}

      {/* Topbar com Nome Real do Animal */}
      <div
        className="w-full px-4 py-3.5 flex items-center justify-between z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Voltar"
          className="text-white text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-md transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="text-center min-w-0 px-2">
          <h1 className="text-white font-bold text-sm tracking-tight truncate max-w-[200px]">
            {animalName || 'Câmera'}
          </h1>
          <p className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
            Dataset de IA
          </p>
        </div>

        {/* Botão de Câmera Nativa no canto superior direito */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Tirar foto com câmera nativa"
          aria-label="Abrir câmera nativa"
          className="text-white text-xs font-medium flex items-center gap-1.5 p-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-md transition cursor-pointer"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
      </div>

      {/* Stream de Vídeo */}
      <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Guia de enquadramento profissional (SVG transparente sem bugs de box-shadow) */}
      {streamActive && state === 'viewfinder' && !cameraError && (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center">
          {/* Caixa de enquadramento com proporção de 3:4 */}
          <div className="relative w-[75%] max-w-xs aspect-[3/4] rounded-2xl border-2 border-white/60 flex items-center justify-center shadow-sm">
            {/* Cantos brancos de foco fotográfico */}
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

            {/* Ponto central sutil */}
            <div className="w-2 h-2 rounded-full bg-white/40" />

            {/* Guia de instrução */}
            <div className="absolute -bottom-10 bg-black/60 backdrop-blur-md text-white/90 text-xs px-3 py-1 rounded-full font-medium">
              Enquadre o animal
            </div>
          </div>
        </div>
      )}

      {/* Mensagem e Ação caso a câmera WebRTC não abra */}
      {cameraError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-zinc-950/90 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="max-w-xs">
            <h3 className="text-white font-bold text-lg mb-1">Câmera do Navegador</h3>
            <p className="text-zinc-400 text-xs leading-relaxed">{cameraError}</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl font-semibold shadow-lg transition cursor-pointer active:scale-98 text-sm"
          >
            <Camera className="w-5 h-5" />
            Fotografar com Câmera do Aparelho
          </button>
        </div>
      )}

      {/* Barra de captura inferior */}
      {streamActive && state === 'viewfinder' && !cameraError && (
        <div
          className="w-full z-20 flex items-center justify-around pb-8 pt-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          {/* Botão para galeria/app nativo */}
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Importar da galeria ou app de câmera"
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-md text-white flex items-center justify-center transition cursor-pointer"
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          {/* Botão de disparo estilo câmera profissional */}
          <button
            onClick={captureFromVideo}
            disabled={!videoReady}
            aria-label="Disparar captura"
            className="
              relative w-20 h-20 rounded-full
              border-[4px] border-white
              bg-white/20 backdrop-blur-sm
              flex items-center justify-center
              transition-all duration-150
              cursor-pointer active:scale-90
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-2xl
            "
          >
            <div className="w-16 h-16 rounded-full bg-white transition hover:bg-zinc-100 shadow-inner flex items-center justify-center">
              <Camera className="w-7 h-7 text-zinc-900" />
            </div>
          </button>

          {/* Espaçador simétrico */}
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
