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
  owner: { id: number; name: string; email: string };
  photos: Photo[];
}

export default function AdminPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPhotoId, setPreviewPhotoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState('Macho');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAnimals = async () => {
    try {
      const res = await fetch('/api/admin/animals');
      if (res.status === 403) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setAnimals(data);
      else setError(data.error || 'Erro ao carregar');
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnimals(); }, []);

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
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
    if (!editingId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/animals/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, breed, sex, weight: Number(weight), age: Number(age) }),
      });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
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

  const handleDelete = async (animalId: number) => {
    if (!confirm('Excluir este animal e todas as fotos?')) return;
    try {
      const res = await fetch(`/api/animals/${animalId}`, { method: 'DELETE' });
      if (res.ok) fetchAnimals();
      else alert('Erro ao excluir');
    } catch {
      alert('Erro de conexão');
    }
  };

  const handlePreview = (animalId: number, photoId: number) => {
    setPreviewPhotoId(photoId);
    setPreview(`/api/download?path=${encodeURIComponent(`/storage/uploads/`)}`);
    // Busca o caminho real do arquivo
    const animal = animals.find(a => a.id === animalId);
    const photo = animal?.photos.find(p => p.id === photoId);
    if (photo) {
      setPreview(`/api/download?path=${encodeURIComponent(photo.filePath)}`);
    }
  };

  const totalFotos = animals.reduce((acc, a) => acc + a.photos.length, 0);

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav className="navbar">
        <span className="navbar-brand">🐄 Cattle Capture — Admin</span>
        <div className="navbar-links">
          <button onClick={handleLogout} className="btn btn-outline btn-sm">
            Sair
          </button>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '2rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.25rem' }}>Painel Administrativo</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {animals.length} animais cadastrados · {totalFotos} fotos capturadas
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Buscar por nome, raça ou dono..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Editar animal #{editingId}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nome</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Raça</label>
                  <input type="text" required value={breed} onChange={e => setBreed(e.target.value)} />
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
                  <input type="number" required min="1" value={weight} onChange={e => setWeight(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Idade (meses)</label>
                  <input type="number" required min="1" value={age} onChange={e => setAge(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        ) : animals.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhum animal registrado no sistema.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Animal</th>
                  <th>Raça / Sexo</th>
                  <th>Peso / Idade</th>
                  <th>Dono</th>
                  <th>Fotos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {animals.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.breed.toLowerCase().includes(searchTerm.toLowerCase()) || a.owner.name.toLowerCase().includes(searchTerm.toLowerCase())).map(animal => (
                  <tr key={animal.id}>
                    <td data-label="ID" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{animal.id}</td>
                    <td data-label="Animal" style={{ fontWeight: 500 }}>{animal.name || `Animal #${animal.id}`}</td>
                    <td data-label="Raça / Sexo">{animal.breed} · {animal.sex}</td>
                    <td data-label="Peso / Idade">{animal.weight} kg · {animal.age} m</td>
                    <td data-label="Dono" style={{ fontSize: '0.875rem' }}>
                      <div>{animal.owner.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{animal.owner.email}</div>
                    </td>
                    <td data-label="Fotos">
                      {animal.photos.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Sem fotos</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {animal.photos.map(photo => (
                            <div key={photo.id} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <img
                                src={`/api/download?path=${encodeURIComponent(photo.filePath)}`}
                                alt={`Foto ${photo.id}`}
                                style={{ width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer', borderRadius: '4px' }}
                                onClick={() => handlePreview(animal.id, photo.id)}
                              />
                              <a
                                href={`/api/download?path=${encodeURIComponent(photo.filePath)}`}
                                download
                                className="btn btn-outline btn-sm"
                                style={{ width: 'auto' }}
                              >
                                ↓
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-label="Ações">
                      <button
                        onClick={() => handleEdit(animal)}
                        className="btn btn-outline btn-sm"
                        style={{ width: 'auto', marginRight: '0.5rem' }}
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

        {/* Modal de preview */}
        {preview && (
          <div
            onClick={() => { setPreview(null); setPreviewPhotoId(null); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.85)', zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <img
              src={preview}
              alt="Preview"
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
}