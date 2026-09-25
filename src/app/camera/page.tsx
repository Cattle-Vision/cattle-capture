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

  useEffect(() => {
    if (!animalId) {
      setError('ID do animal não fornecido na URL. Por favor, acesse pelo Dashboard.');
      return;
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      } catch (err: any) {
        setError('Não foi possível acessar a câmera. Verifique as permissões (ou se está usando HTTPS).');
      }
    }
    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [animalId]);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !animalId) return;

    // TODO: Integração ONNX (YOLO 26 nano) ocorrerá aqui antes do upload!
    
    // Simulação da captura do frame
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setUploading(true);
      
      const formData = new FormData();
      formData.append('file', blob, `animal_${animalId}.jpg`);
      formData.append('animalId', animalId);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          alert('IA validou e foto salva com sucesso!');
          window.location.href = '/dashboard';
        } else {
          alert('Erro ao salvar foto.');
        }
      } catch (err) {
        alert('Erro de conexão ao enviar a foto.');
      } finally {
        setUploading(false);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <Link href="/dashboard" style={{ position: 'absolute', top: '20px', left: '20px', color: 'white', zIndex: 20, fontWeight: 'bold', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
        ← Voltar
      </Link>

      {error && (
        <div style={{ position: 'absolute', top: '80px', backgroundColor: '#ef4444', color: 'white', padding: '1rem', borderRadius: '8px', zIndex: 10, maxWidth: '80%', textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Video Feed */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Visual Guide (Stencil) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ width: '80%', maxWidth: '400px', height: '60%', border: '4px dashed rgba(52, 211, 153, 0.8)', borderRadius: '24px', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)' }}></div>
        <p style={{ color: 'white', marginTop: '2rem', fontSize: '1.2rem', fontWeight: 'bold', textShadow: '1px 1px 4px black', textAlign: 'center' }}>
          Alinhe a traseira do animal no centro <br/> a exatamente 1 metro de distância.
        </p>
      </div>

      {/* Capture Button */}
      {streamActive && !error && (
        <button 
          onClick={handleCapture}
          disabled={uploading}
          style={{
            position: 'absolute', bottom: '40px', width: '80px', height: '80px', borderRadius: '50%',
            backgroundColor: uploading ? '#94a3b8' : '#34d399', border: '6px solid white', cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)', zIndex: 10, transition: 'background-color 0.2s'
          }}
        />
      )}
    </>
  );
}

export default function CameraPage() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Suspense fallback={<div style={{ color: 'white', marginTop: '50vh' }}>Carregando Câmera...</div>}>
        <CameraContent />
      </Suspense>
    </div>
  );
}
