'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl">🐄</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">CattleCapture</h1>
          <p className="text-slate-500 text-sm mt-1">Entre na sua conta para continuar</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-5 border border-red-100 text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 pl-10 pr-4 py-3 rounded-xl outline-none transition text-slate-900 placeholder:text-slate-400"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 pl-10 pr-4 py-3 rounded-xl outline-none transition text-slate-900 placeholder:text-slate-400"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`
                w-full py-3.5 rounded-2xl text-white font-semibold transition mt-2
                flex items-center justify-center gap-2
                ${loading
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] shadow-md'
                }
              `}
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Entrando...</> : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          Não tem uma conta?{' '}
          <Link href="/register" className="text-emerald-600 font-semibold hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
