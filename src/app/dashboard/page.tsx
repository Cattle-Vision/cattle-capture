'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [animals, setAnimals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('Fêmea');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');

  const fetchAnimals = async () => {
    try {
      const res = await fetch('/api/animals');
      if (res.ok) {
        const data = await res.json();
        setAnimals(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnimals();
  }, []);

  const handleRegisterAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/animals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ breed, sex, weight, age })
      });
      if (res.ok) {
        setBreed(''); setWeight(''); setAge('');
        fetchAnimals();
      } else {
        alert('Erro ao registrar');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #34d399, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Meus Bovinos
        </h1>
        <Link href="/" style={{ color: 'var(--text-muted)' }}>Sair</Link>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        
        {/* Formulário de Novo Animal */}
        <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'white' }}>Registrar Novo</h2>
          <form onSubmit={handleRegisterAnimal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              className="input-premium" type="text" placeholder="Raça (ex: Nelore)" required 
              value={breed} onChange={e => setBreed(e.target.value)}
            />
            <select className="input-premium" value={sex} onChange={e => setSex(e.target.value)} required>
              <option value="Fêmea">Fêmea</option>
              <option value="Macho">Macho</option>
            </select>
            <input 
              className="input-premium" type="number" placeholder="Peso (kg)" required 
              value={weight} onChange={e => setWeight(e.target.value)}
            />
            <input 
              className="input-premium" type="number" placeholder="Idade (meses)" required 
              value={age} onChange={e => setAge(e.target.value)}
            />
            <button type="submit" className="btn-premium" style={{ marginTop: '0.5rem' }}>Salvar Animal</button>
          </form>
        </div>

        {/* Lista de Animais */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'white' }}>Seu Rebanho</h2>
          
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
          ) : animals.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nenhum animal cadastrado ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {animals.map(animal => (
                <div key={animal.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>#{animal.id} - {animal.breed}</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{animal.sex} • {animal.weight}kg • {animal.age} meses</p>
                    <p style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '0.25rem' }}>{animal.photos?.length || 0} fotos salvas</p>
                  </div>
                  <Link href={`/camera?animalId=${animal.id}`} className="btn-premium" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                    Tirar Foto
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
