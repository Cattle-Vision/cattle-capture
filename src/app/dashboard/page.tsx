'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DashboardPage() {
  const [animals, setAnimals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/animals')
      .then(r => {
        if (r.status === 401) router.push('/api/auth/signin');
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setAnimals(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8">
      <header className="max-w-4xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Meus Animais</h1>
        <div className="flex gap-4">
          <Link href="/animal/new" className="text-sm text-white hover:bg-green-700 px-3 py-1 rounded bg-green-600">Cadastrar Animal</Link>
          <Link href="/api/auth/signout" className="text-sm text-zinc-500 hover:text-zinc-900 border px-3 py-1 rounded bg-white">Sair</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          {loading ? (
             <div className="p-8 text-center text-zinc-500 animate-pulse">Carregando gado...</div>
          ) : animals.length === 0 ? (
             <div className="p-8 text-center text-zinc-500">Nenhum animal cadastrado.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {animals.map(a => (
                <div key={a.id} className="border rounded-lg p-4 bg-zinc-50 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">#{a.id}</div>
                    <h3 className="font-semibold text-lg text-zinc-800">{a.name || 'Sem Nome'}</h3>
                    <p className="text-sm text-zinc-600">{a.breed} • {a.sex}</p>
                    <p className="text-sm text-zinc-600">{a.weight}kg • {a.age}m</p>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t flex flex-col gap-2">
                    <div className="text-xs text-zinc-500 mb-2">{a.photos?.length || 0} fotos salvas na galeria</div>
                    <div className="flex gap-2">
                      <Link 
                        href={`/animal/${a.id}`}
                        className="bg-zinc-200 text-zinc-800 text-center py-2 flex-1 rounded-md hover:bg-zinc-300 transition text-sm font-medium"
                      >
                        Ver Perfil
                      </Link>
                      <Link 
                        href={`/camera?animalId=${a.id}`}
                        className="bg-green-600 text-white text-center py-2 flex-1 rounded-md hover:bg-green-700 transition text-sm font-medium"
                      >
                        Capturar
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
