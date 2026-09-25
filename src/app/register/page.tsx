'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (res.ok) {
      router.push('/login');
    } else {
      const data = await res.json();
      setError(data.error || 'Erro ao cadastrar.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-zinc-100">
        <h1 className="text-2xl font-bold text-center text-zinc-900 mb-2">Criar Conta</h1>
        <p className="text-center text-zinc-500 mb-8 text-sm">Preencha seus dados para começar</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Nome</label>
            <input 
              type="text" 
              required 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              placeholder="João da Silva"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Senha</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              placeholder="••••••••"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3 rounded-lg text-white font-semibold shadow-md transition mt-2 ${loading ? 'bg-zinc-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
        
        <p className="text-center text-sm text-zinc-500 mt-6">
          Já tem uma conta? <a href="/login" className="text-green-600 font-medium hover:underline">Entrar</a>
        </p>
      </div>
    </div>
  );
}
