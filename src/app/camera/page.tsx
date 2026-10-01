'use client';

/**
 * Página de captura de foto via câmera do dispositivo.
 *
 * Fluxo:
 * 1. Solicita acesso à câmera (facingMode: environment = câmera traseira)
 * 2. Mostra viewfinder com guia de enquadramento
 * 3. Ao capturar: mostra preview da foto para confirmação
 * 4. Usuário confirma → upload; ou tira outra foto
 * 5. Upload via /api/upload com fallback para fila de sync offline
 *
 * Problemas corrigidos vs versão anterior:
 * - safe-area-inset-bottom aplicado corretamente ao botão de captura
 * - Preview antes de enviar (evita uploads acidentais)
 * - Feedback visual claro em cada estado
 * - Processamento ONNX mantido mas isolado para não bloquear o UI
 */

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, RefreshCcw, RotateCcw, Check, X } from 'lucide-react';
import { enqueueSync } from '@/lib/sync';

type CaptureState = 'viewfinder' | 'preview' | 'uploading' | 'done' | 'error';

function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId = searchParams.get('animalId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CaptureState>('viewfinder');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  // Iniciar câmera
  useEffect(() => {
    if (!animalId) {
      setCameraError('Animal não especificado. Volte e tente novamente.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmera indisponível. Verifique se você está acessando via HTTPS.');
      return;
    }

    // Preferência: câmera traseira de alta qualidade
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      })
      .catch(() => {
        setCameraError('Permissão de câmera negada. Verifique as configurações do navegador.');
      });

    // Cleanup: parar stream ao desmontar
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [animalId]);

  // Capturar frame do vídeo e gerar preview
  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Salvar em resolução original para qualidade máxima no dataset
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    // Gerar URL de preview local (sem enviar para o servidor ainda)
    const previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreviewUrl(previewDataUrl);

    // Gerar Blob para upload (feito apenas se o usuário confirmar)
    canvas.toBlob(blob => {
      if (blob) {
        setCapturedBlob(blob);
        setState('preview');

        // Processar IA em background sem bloquear a UI (fire-and-forget)
        runAIValidation(canvas).catch(err =>
          console.warn('[AI] Validação falhou (não crítico):', err)
        );
      }
    }, 'image/jpeg', 0.85);
  };

  // Processamento ONNX isolado — não bloqueia o fluxo principal
  const runAIValidation = async (canvas: HTMLCanvasElement) => {
    const aiSize = 224;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = aiSize;
    tempCanvas.height = aiSize;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(canvas.width, canvas.height);
    const sx = (canvas.width - size) / 2;
    const sy = (canvas.height - size) / 2;
    ctx.drawImage(canvas, sx, sy, size, size, 0, 0, aiSize, aiSize);

    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

    const imgData = ctx.getImageData(0, 0, aiSize, aiSize).data;
    const float32 = new Float32Array(3 * aiSize * aiSize);
    for (let i = 0; i < aiSize * aiSize; i++) {
      float32[i] = (imgData[i * 4] / 255.0 - 0.485) / 0.229;
      float32[i + aiSize * aiSize] = (imgData[i * 4 + 1] / 255.0 - 0.456) / 0.224;
      float32[i + 2 * aiSize * aiSize] = (imgData[i * 4 + 2] / 255.0 - 0.406) / 0.225;
    }
    const tensor = new ort.Tensor('float32', float32, [1, 3, aiSize, aiSize]);

    try {
      const session = await ort.InferenceSession.create('/identifier.onnx');
      const feeds: Record<string, typeof tensor> = {};
      feeds[session.inputNames[0]] = tensor;
      const results = await session.run(feeds);
      console.log('[AI] Output:', results);
    } catch {
      // Modelo ONNX ausente ou incompatível — não é crítico para o MVP
    }
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
        throw new Error('API error');
      }
    } catch {
      // Fallback offline: enfileirar para sync posterior
      try {
        const buffer = await capturedBlob.arrayBuffer();
        await enqueueSync('/api/upload', 'POST', { file: buffer, fileName, animalId }, true);
        setState('done');
      } catch {
        setState('error');
      }
    }
  };

  // Descartar e voltar para o viewfinder
  const retake = () => {
    setPreviewUrl(null);
    setCapturedBlob(null);
    setState('viewfinder');
  };

  // ── Estados de UI ──────────────────────────────────────────────────────

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-zinc-900 text-white gap-6 px-8">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center animate-scale-in">
          <Check className="w-10 h-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Foto salva!</h2>
          <p className="text-white/60 text-sm">A imagem foi adicionada ao animal com sucesso.</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push(`/animal/${animalId}`)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-semibold transition"
          >
            Ver Galeria
          </button>
          <button
            onClick={retake}
            className="w-full py-3.5 bg-white/10 hover:bg-white/20 rounded-2xl font-medium transition text-sm"
          >
            Tirar Outra Foto
          </button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-zinc-900 text-white gap-6 px-8">
        <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center">
          <X className="w-10 h-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Erro ao salvar</h2>
          <p className="text-white/60 text-sm">Verifique sua conexão e tente novamente.</p>
        </div>
        <button
          onClick={retake}
          className="w-full max-w-xs py-3.5 bg-white/10 hover:bg-white/20 rounded-2xl font-medium transition"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
      {/* Canvas oculto para processamento */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── ESTADO: Preview após captura ─────────────────────────────── */}
      {state === 'preview' && previewUrl && (
        <div className="absolute inset-0 flex flex-col z-30 bg-black">
          <img
            src={previewUrl}
            alt="Preview da captura"
            className="flex-1 object-contain w-full animate-fade-in"
          />
          <div
            className="flex gap-4 p-5 bg-black/80"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={retake}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-medium transition"
            >
              <RotateCcw className="w-5 h-5" />
              Tirar Outra
            </button>
            <button
              onClick={confirmUpload}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 rounded-2xl text-white font-semibold transition"
            >
              <Check className="w-5 h-5" />
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* ── ESTADO: Uploading ─────────────────────────────────────────── */}
      {state === 'uploading' && previewUrl && (
        <div className="absolute inset-0 flex flex-col z-30 bg-black">
          <img
            src={previewUrl}
            alt="Preview"
            className="flex-1 object-contain w-full opacity-50"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/70 rounded-2xl px-8 py-6 flex flex-col items-center gap-4">
              <RefreshCcw className="w-10 h-10 text-white animate-spin" />
              <p className="text-white font-medium">Salvando foto...</p>
            </div>
          </div>
        </div>
      )}

      {/* ── ESTADO: Viewfinder ───────────────────────────────────────── */}

      {/* Topbar */}
      <div className="absolute top-0 w-full p-4 flex justify-between z-10 bg-gradient-to-b from-black/80 to-transparent"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => router.back()}
          className="text-white text-sm font-medium flex items-center gap-1 px-3 py-2 rounded-xl bg-black/30 hover:bg-black/50 active:bg-black/70 transition"
        >
          ← Voltar
        </button>
        <span className="text-white/70 text-sm self-center">Animal #{animalId}</span>
      </div>

      {/* Erro de câmera */}
      {cameraError && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white px-6 py-4 rounded-2xl shadow z-20 max-w-xs text-center text-sm font-medium leading-relaxed">
          {cameraError}
        </div>
      )}

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Guia de enquadramento */}
      {streamActive && state === 'viewfinder' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          {/* Overlay escuro fora do guia */}
          <div
            className="w-[72%] max-w-xs"
            style={{
              aspectRatio: '3/4',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
              border: '2px solid rgba(255,255,255,0.7)',
              borderRadius: '16px',
            }}
          />
          {/* Texto de instrução */}
          <span className="absolute bottom-[38%] text-white/60 text-xs font-medium">
            Enquadre a garupa do animal
          </span>
        </div>
      )}

      {/* Botão de captura */}
      {streamActive && state === 'viewfinder' && !cameraError && (
        <div
          className="absolute bottom-0 left-0 w-full flex justify-center items-center z-20 pb-8"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={capture}
            aria-label="Capturar foto"
            className="
              w-20 h-20 rounded-full
              border-4 border-white/60
              bg-white shadow-2xl
              flex items-center justify-center
              transition active:scale-90
              hover:bg-white/90
            "
          >
            <Camera className="text-black w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function CameraPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-black flex items-center justify-center text-white/60 text-sm">
          Iniciando câmera...
        </div>
      }
    >
      <CameraContent />
    </Suspense>
  );
}
