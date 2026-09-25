'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminPage() {
  const [animals, setAnimals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/animals')
      .then(r => {
        if (r.status === 401) router.push('/api/auth/signin');
        if (r.status === 403) router.push('/dashboard');
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setAnimals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const handleDownload = () => {
    window.location.href = '/api/export';
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8">
      <header className="max-w-6xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Painel de Administração (Dataset)</h1>
        <div className="flex gap-4">
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 border px-3 py-1 rounded bg-white">Ir pro Dashboard</Link>
          <button onClick={handleDownload} className="text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded">
            Baixar Dataset (ZIP)
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          {loading ? (
             <div className="p-8 text-center text-zinc-500 animate-pulse">Carregando base de dados...</div>
          ) : animals.length === 0 ? (
             <div className="p-8 text-center text-zinc-500">Nenhum animal cadastrado no sistema.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-600">
                <thead className="bg-zinc-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium text-zinc-900">ID</th>
                    <th className="px-4 py-3 font-medium text-zinc-900">Proprietário</th>
                    <th className="px-4 py-3 font-medium text-zinc-900">Raça/Sexo</th>
                    <th className="px-4 py-3 font-medium text-zinc-900">Peso/Idade</th>
                    <th className="px-4 py-3 font-medium text-zinc-900">Fotos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {animals.map(a => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">#{a.id} {a.name && `(${a.name})`}</td>
                      <td className="px-4 py-3">{a.owner?.name || a.owner?.email}</td>
                      <td className="px-4 py-3">{a.breed} • {a.sex}</td>
                      <td className="px-4 py-3">{a.weight}kg • {a.age}m</td>
                      <td className="px-4 py-3 font-medium text-green-600">{a.photos?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
