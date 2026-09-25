'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewAnimalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    breed: '',
    sex: 'Macho',
    weight: '',
    age: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/animals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setError('Erro ao salvar o animal.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8">
      <header className="max-w-xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Novo Cadastro</h1>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">Voltar</Link>
      </header>

      <main className="max-w-xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-4">
          {error && <div className="text-red-500 text-sm mb-4 bg-red-50 p-2 rounded">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Apelido / Brinco</label>
            <input 
              type="text" 
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg"
              placeholder="Ex: Mimosa"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Raça</label>
            <input 
              type="text" 
              required
              value={formData.breed}
              onChange={e => setFormData({ ...formData, breed: e.target.value })}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg"
              placeholder="Ex: Nelore"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Sexo</label>
            <select 
              value={formData.sex}
              onChange={e => setFormData({ ...formData, sex: e.target.value })}
              className="w-full border border-zinc-300 px-4 py-2 rounded-lg bg-white"
            >
              <option value="Macho">Macho</option>
              <option value="Fêmea">Fêmea</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Peso (kg)</label>
              <input 
                type="number" 
                required
                value={formData.weight}
                onChange={e => setFormData({ ...formData, weight: e.target.value })}
                className="w-full border border-zinc-300 px-4 py-2 rounded-lg"
                placeholder="Ex: 450"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Idade (meses)</label>
              <input 
                type="number" 
                required
                value={formData.age}
                onChange={e => setFormData({ ...formData, age: e.target.value })}
                className="w-full border border-zinc-300 px-4 py-2 rounded-lg"
                placeholder="Ex: 24"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3 rounded-lg text-white font-semibold transition mt-4 ${loading ? 'bg-zinc-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {loading ? 'Salvando...' : 'Cadastrar Animal'}
          </button>
        </form>
      </main>
    </div>
  );
}
