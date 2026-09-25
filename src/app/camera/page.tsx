'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, RefreshCcw } from 'lucide-react';
import { enqueueSync } from '@/lib/sync';

function CameraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const animalId = searchParams.get('animalId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    if (!animalId) {
      setError('Animal não especificado.');
      return;
    }
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      })
      .catch(() => setError('Câmera inacessível.'));
      
    return () => currentStream?.getTracks().forEach(t => t.stop());
  }, [animalId]);

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    setLoading(true);
    canvas.toBlob(async blob => {
      if (!blob) { setLoading(false); return; }
      
      const fileName = `animal_${animalId}_${Date.now()}.jpg`;
      const form = new FormData();
      form.append('file', blob, fileName);
      form.append('animalId', animalId!);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (res.ok) setDone(true);
        else throw new Error('Falha API');
      } catch (err) {
        // Enqueue to IndexedDB
        try {
          const buffer = await blob.arrayBuffer();
          await enqueueSync('/api/upload', 'POST', { file: buffer, fileName, animalId }, true);
          setDone(true);
        } catch {
          setError('Erro crítico ao salvar.');
        }
      } finally {
        setLoading(false);
      }
    }, 'image/jpeg', 0.85);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-zinc-900 text-white gap-4">
        <h2 className="text-2xl font-bold text-green-400">Capturado!</h2>
        <button onClick={() => router.push('/dashboard')} className="px-6 py-2 bg-green-600 rounded shadow">
          Voltar ao Painel
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Topbar */}
      <div className="absolute top-0 w-full p-4 flex justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => router.push('/dashboard')} className="text-white text-sm">← Voltar</button>
        <span className="text-white/80 text-sm">Animal #{animalId}</span>
      </div>

      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow z-20 whitespace-nowrap">
          {error}
        </div>
      )}

      {/* Video Viewfinder */}
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

      {/* Guide Overlay */}
      {streamActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-[70%] max-w-sm aspect-[3/4] border-2 border-white/60 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        </div>
      )}

      {/* Controls */}
      {streamActive && !error && (
        <div className="absolute bottom-[env(safe-area-inset-bottom)] pb-8 left-0 w-full flex justify-center items-center z-20">
          <button
            onClick={capture}
            disabled={loading}
            className={`w-20 h-20 rounded-full border-4 border-white/50 shadow-xl flex items-center justify-center transition ${loading ? 'bg-zinc-400' : 'bg-white active:scale-95'}`}
          >
            {loading ? <RefreshCcw className="animate-spin text-white w-8 h-8" /> : <Camera className="text-black w-8 h-8" />}
          </button>
        </div>
      )}
    </div>
  );
}


export default function CameraPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] bg-black text-white p-8">Iniciando câmera...</div>}>
      <CameraContent />
    </Suspense>
  );
}
