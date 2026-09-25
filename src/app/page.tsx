import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <main className="glass-panel animate-fade-in" style={{ maxWidth: '600px', width: '100%', padding: '3rem 2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', background: 'linear-gradient(to right, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Cattle Capture
        </h1>
        <p style={{ fontSize: '1.1rem', marginBottom: '3rem', color: 'var(--text-muted)' }}>
          Sistema inteligente de avaliação e identificação bovina com Inteligência Artificial Edge.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" className="btn-premium" style={{ width: 'auto', minWidth: '150px' }}>
            Acessar Sistema
          </Link>
          <Link href="/register" className="btn-premium" style={{ width: 'auto', minWidth: '150px', background: 'rgba(255,255,255,0.1)', color: 'white' }}>
            Criar Conta
          </Link>
        </div>
      </main>
    </div>
  );
}
