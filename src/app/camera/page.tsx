'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function CameraContent() {
  const searchParams = useSearchParams();
  const animalId = searchParams.get('animalId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!animalId) {
      setError('Animal não informado. Volte ao Dashboard e clique em "Tirar foto".');
      return;
    }
    let currentStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      })
      .catch(() => {
        setError('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      });

    return () => {
      currentStream?.getTracks().forEach(t => t.stop());
    };
  }, [animalId]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !animalId) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    // TODO: aqui entrará a inferência do identifier.onnx (YOLO) antes de enviar
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', blob, `animal_${animalId}_${Date.now()}.jpg`);
        form.append('animalId', animalId);
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (res.ok) {
          setDone(true);
        } else {
          setError('Erro ao enviar foto. Tente novamente.');
        }
      } catch {
        setError('Erro de conexão.');
      } finally {
        setUploading(false);
      }
    }, 'image/jpeg', 0.9);
  };

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', padding: '2rem' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2 style={{ fontWeight: 700 }}>Foto salva com sucesso!</h2>
        <Link href="/dashboard" className="btn btn-primary" style={{ width: 'auto' }}>
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Barra superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1rem', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)'
      }}>
        <Link href="/dashboard" style={{ color: 'white', fontSize: '0.9rem' }}>← Voltar</Link>
        <span style={{ color: 'white', fontSize: '0.9rem', opacity: 0.8 }}>
          Animal #{animalId}
        </span>
      </div>

      {/* Erro */}
      {error && (
        <div style={{
          position: 'absolute', top: '5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: 'white', padding: '1rem 1.5rem', borderRadius: '8px',
          zIndex: 20, textAlign: 'center', maxWidth: '80vw', fontSize: '0.9rem'
        }}>
          {error}
        </div>
      )}

      {/* Feed da câmera */}
      <video ref={videoRef} autoPlay playsInline muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* Guia visual */}
      {streamActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {/* Área escura ao redor */}
          <div style={{
            width: '72%', maxWidth: '380px', aspectRatio: '1 / 1.3',
            border: '3px solid rgba(255,255,255,0.8)',
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
          }} />
          <p style={{
            color: 'white', marginTop: '1.5rem', fontSize: '0.9rem',
            textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            maxWidth: '280px'
          }}>
            Posicione a traseira do animal dentro do quadro.<br />
            <strong>Distância: ~1 metro. Câmera reta.</strong>
          </p>
        </div>
      )}

      {/* Botão de captura */}
      {streamActive && !error && (
        <div style={{ position: 'absolute', bottom: '2.5rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20 }}>
          <button
            onClick={handleCapture}
            disabled={uploading}
            style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: uploading ? '#9ca3af' : 'white',
              border: '5px solid rgba(255,255,255,0.5)',
              cursor: uploading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              outline: 'none'
            }}
            aria-label="Capturar foto"
          />
        </div>
      )}

      {uploading && (
        <div style={{
          position: 'absolute', bottom: '7rem', left: 0, right: 0,
          textAlign: 'center', color: 'white', fontSize: '0.875rem',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)'
        }}>
          Enviando foto...
        </div>
      )}
    </>
  );
}

export default function CameraPage() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <Suspense fallback={
        <div style={{ color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          Carregando câmera...
        </div>
      }>
        <CameraContent />
      </Suspense>
    </div>
  );
}
