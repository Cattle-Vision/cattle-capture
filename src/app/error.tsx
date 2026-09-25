'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Algo deu errado!</h2>
      <p style={{ color: 'red' }}>{error.message}</p>
      <button className="btn btn-primary" onClick={() => reset()} style={{ marginTop: '1rem', width: 'auto' }}>
        Tentar novamente
      </button>
    </div>
  );
}
