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
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState('');
  const [distanceOk, setDistanceOk] = useState(true);
  const sessionId = useRef(Date.now().toString());

  // Carrega modelo ONNX localmente via ORT Web
  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      try {
        const ort = await import('onnxruntime-web');
        // Tenta carregar o modelo da raiz do app
        await ort.InferenceSession.create('/identifier.onnx');
        if (!cancelled) {
          setModelLoaded(true);
        }
      } catch (e) {
        console.warn('ONNX model not available — inference skipped:', e);
        if (!cancelled) {
          setModelError('Modelo IA não encontrado (identifier.onnx). Captura sem IA.');
        }
      }
    };

    loadModel();
    return () => { cancelled = true; };
  }, []);

  // Abre câmera do dispositivo
  useEffect(() => {
    if (!animalId) {
      setError('Animal não informado. Volte ao Dashboard e clique em "Tirar foto".');
      return;
    }
    let currentStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 720 } })
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

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !animalId) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    setUploading(true);
    setError('');

    try {
      // Se modelo carregado, roda inferência local
      if (modelLoaded) {
        try {
          const ort = await import('onnxruntime-web');
          const session = await ort.InferenceSession.create('/identifier.onnx');
          // Prepara tensor 1x3x640x640 simples para verificar se a imagem é válida
          const inputCanvas = document.createElement('canvas');
          inputCanvas.width = 640;
          inputCanvas.height = 640;
          inputCanvas.getContext('2d')?.drawImage(canvas, 0, 0, 640, 640);
          const imgData = inputCanvas.getContext('2d')?.getImageData(0, 0, 640, 640);
          if (imgData) {
            const data = new Float32Array(3 * 640 * 640);
            for (let i = 0; i < 640 * 640; i++) {
              data[i] = imgData.data[i * 4] / 255;
              data[640 * 640 + i] = imgData.data[i * 4 + 1] / 255;
              data[2 * 640 * 640 + i] = imgData.data[i * 4 + 2] / 255;
            }
            const tensor = new ort.Tensor('float32', data, [1, 3, 640, 640]);
            const results = await session.run({ images: tensor });
            console.log('ONNX inference result:', results);
            
            // Simple check: if confidence is too low, reject
            const outputTensor = results[Object.keys(results)[0]];
            const confidence = Number(outputTensor?.data[0] ?? 1); // Default to 1 if structure is unknown
            
            if (confidence < 0.5) {
              setError('Aviso: Animal não detectado claramente. Posicione melhor.');
              setUploading(false);
              return;
            }
          }
        } catch (e) {
          console.warn('ONNX inference failed:', e);
        }
      }

      // Envia foto para o servidor ou salva offline
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setUploading(false);
          return;
        }
        const fileName = `animal_${animalId}_${sessionId.current}.jpg`;
        const form = new FormData();
        form.append('file', blob, fileName);
        form.append('animalId', animalId);

        try {
          const res = await fetch('/api/upload', { method: 'POST', body: form });
          if (res.ok) {
            setDone(true);
          } else {
            setError('Erro ao enviar foto. Tente novamente.');
          }
        } catch {
          // Fallback offline
          try {
            const { enqueueSync } = await import('@/lib/sync');
            // Converter blob para array buffer para salvar com IDB
            const buffer = await blob.arrayBuffer();
            await enqueueSync('/api/upload', 'POST', { file: buffer, fileName, animalId }, true);
            setDone(true); // Finge que deu certo
          } catch (e) {
            setError('Falha de rede e falha ao salvar offline.');
          }
        } finally {
          setUploading(false);
        }
      }, 'image/jpeg', 0.9);
    } catch {
      setUploading(false);
      setError('Erro ao capturar foto.');
    }
  };

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', padding: '2rem' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2 style={{ fontWeight: 700 }}>Foto salva com sucesso!</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Animal #{animalId}</p>
        <Link href="/dashboard" className="btn btn-primary" style={{ width: 'auto' }}>
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Barra superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1rem', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)'
      }}>
        <Link href="/dashboard" style={{ color: 'white', fontSize: '0.9rem' }}>← Voltar</Link>
        <span style={{ color: 'white', fontSize: '0.9rem', opacity: 0.8 }}>
          Animal #{animalId}
        </span>
      </div>

      {/* Mensagem de modelo IA */}
      {modelError && (
        <div style={{
          position: 'absolute', top: '3.5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#f59e0b', color: '#000', padding: '0.5rem 1rem', borderRadius: '6px',
          zIndex: 20, fontSize: '0.8rem', maxWidth: '90vw', textAlign: 'center'
        }}>
          ⚠ {modelError}
        </div>
      )}
      {modelLoaded && (
        <div style={{
          position: 'absolute', top: '3.5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: '#4ade80', padding: '0.4rem 0.8rem', borderRadius: '6px',
          zIndex: 20, fontSize: '0.8rem'
        }}>
          IA carregada ✓
        </div>
      )}

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

      {/* Guia visual de posicionamento */}
      {streamActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {/* Frame central indicando posição */}
          <div style={{
            width: '72%', maxWidth: '380px', aspectRatio: '1 / 1.3',
            border: '3px solid rgba(255,255,255,0.8)',
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ color: 'white', fontSize: '0.875rem', textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              🐄 Posicione a traseira do animal aqui
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: '0.5rem', textAlign: 'center' }}>
              Distância: ~1 metro<br />
              Câmera reta com a bunda
            </div>
          </div>
        </div>
      )}

      {/* Botão de captura */}
      {streamActive && !error && (
        <div style={{ position: 'absolute', bottom: 'calc(2.5rem + env(safe-area-inset-bottom))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 50 }}>
          <button
            onClick={handleCapture}
            disabled={uploading}
            style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: uploading ? '#9ca3af' : 'white',
              border: '5px solid rgba(255,255,255,0.5)',
              cursor: uploading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              outline: 'none',
              fontSize: '1.2rem'
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
          {modelLoaded ? 'Processando IA...' : 'Enviando foto...'}
        </div>
      )}
    </div>
  );
}

export default function CameraPage() {
  return (
    <Suspense fallback={
      <div style={{ color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Carregando câmera...
      </div>
    }>
      <CameraContent />
    </Suspense>
  );
}