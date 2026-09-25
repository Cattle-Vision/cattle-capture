'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Animal {
  id: number;
  name: string;
  breed: string;
  sex: string;
  weight: number;
  age: number;
  photos: { id: number }[];
}

export default function DashboardPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Campos do formulário
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('Macho');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');

  const fetchAnimals = async () => {
    try {
      const res = await fetch('/api/animals');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) setAnimals(await res.json());
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnimals(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/animals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, breed, sex, weight: Number(weight), age: Number(age) }),
      });
      if (res.ok) {
        setName(''); setBreed(''); setWeight(''); setAge(''); setSex('Macho');
        setShowForm(false);
        fetchAnimals();
      } else {
        const d = await res.json();
        setError(d.error || 'Erro ao salvar animal');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="navbar">
        <span className="navbar-brand">🐄 Cattle Capture</span>
        <div className="navbar-links">
          <button
            onClick={handleLogout}
            className="btn btn-outline btn-sm"
          >
            Sair
          </button>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700 }}>Meus Animais</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Cadastre um animal e depois tire a foto pela câmera
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ width: 'auto' }}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancelar' : '+ Novo animal'}
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Novo animal</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Nome / Identificação</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boi 01, Nelore A" />
                </div>
                <div className="form-group">
                  <label>Raça</label>
                  <input type="text" required value={breed} onChange={e => setBreed(e.target.value)} placeholder="Ex: Nelore" />
                </div>
                <div className="form-group">
                  <label>Sexo</label>
                  <select value={sex} onChange={e => setSex(e.target.value)}>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Peso (kg)</label>
                  <input type="number" required min="1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Ex: 450" />
                </div>
                <div className="form-group">
                  <label>Idade (meses)</label>
                  <input type="number" required min="1" value={age} onChange={e => setAge(e.target.value)} placeholder="Ex: 24" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar animal'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        ) : animals.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Nenhum animal cadastrado ainda.</p>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm(true)}>
              Cadastrar primeiro animal
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Raça</th>
                  <th>Sexo</th>
                  <th>Peso</th>
                  <th>Idade</th>
                  <th>Fotos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {animals.map(animal => (
                  <tr key={animal.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{animal.id}</td>
                    <td style={{ fontWeight: 500 }}>{animal.name || '—'}</td>
                    <td>{animal.breed}</td>
                    <td>{animal.sex}</td>
                    <td>{animal.weight} kg</td>
                    <td>{animal.age} m</td>
                    <td>
                      <span className={`badge ${animal.photos.length > 0 ? 'badge-green' : 'badge-gray'}`}>
                        {animal.photos.length} foto{animal.photos.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/camera?animalId=${animal.id}`}
                        className="btn btn-primary btn-sm"
                        style={{ width: 'auto' }}
                      >
                        Tirar foto
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
