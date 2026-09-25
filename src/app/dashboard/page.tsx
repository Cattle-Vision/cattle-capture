'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Photo {
  id: number;
  filePath: string;
  createdAt: string;
}

interface Animal {
  id: number;
  name: string;
  breed: string;
  sex: string;
  weight: number;
  age: number;
  photos: Photo[];
}

export default function DashboardPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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

  const resetForm = () => {
    setName(''); setBreed(''); setWeight(''); setAge(''); setSex('Macho');
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (animal: Animal) => {
    setName(animal.name || '');
    setBreed(animal.breed);
    setSex(animal.sex);
    setWeight(String(animal.weight));
    setAge(String(animal.age));
    setEditingId(animal.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const url = editingId ? `/api/animals/${editingId}` : '/api/animals';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, breed, sex, weight: Number(weight), age: Number(age) }),
      });
      if (res.ok) {
        resetForm();
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

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este animal e todas as fotos?')) return;
    try {
      const res = await fetch(`/api/animals/${id}`, { method: 'DELETE' });
      if (res.ok) fetchAnimals();
      else alert('Erro ao excluir');
    } catch {
      alert('Erro de conexão');
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
          <button onClick={handleLogout} className="btn btn-outline btn-sm">
            Sair
          </button>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700 }}>Meus Animais</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Cadastre um animal e depois tire a foto pela câmera
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ width: 'auto' }}
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            + Novo animal
          </button>
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>
              {editingId ? 'Editar animal' : 'Novo animal'}
            </h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
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
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando...' : (editingId ? 'Atualizar' : 'Salvar animal')}
                </button>
                <button type="button" className="btn btn-outline" onClick={resetForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        ) : animals.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Nenhum animal cadastrado ainda.</p>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { resetForm(); setShowForm(true); }}>
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
                      {animal.photos.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Sem fotos</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                          {animal.photos.map(photo => (
                            <a
                              key={photo.id}
                              href={`/api/download?path=${encodeURIComponent(photo.filePath)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={`/api/download?path=${encodeURIComponent(photo.filePath)}`}
                                alt={`Foto ${photo.id}`}
                                style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ccc' }}
                              />
                            </a>
                          ))}
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            ({animal.photos.length})
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/camera?animalId=${animal.id}`}
                        className="btn btn-primary btn-sm"
                        style={{ width: 'auto', marginRight: '0.25rem' }}
                      >
                        Tirar foto
                      </Link>
                      <button
                        onClick={() => handleEdit(animal)}
                        className="btn btn-outline btn-sm"
                        style={{ width: 'auto', marginRight: '0.25rem' }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(animal.id)}
                        className="btn btn-outline btn-sm"
                        style={{ width: 'auto', color: '#dc2626', borderColor: '#dc2626' }}
                      >
                        Excluir
                      </button>
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