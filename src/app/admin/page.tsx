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

  useEffect(() => {
    fetch('/api/admin/animals')
      .then(async (res) => {
        if (res.status === 403) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setAnimals(data);
        else setError(data.error || 'Erro ao carregar');
      })
      .catch(() => setError('Erro de conexão'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
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
                </tr>
              </thead>
              <tbody>
                {animals.map(animal => (
                  <tr key={animal.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>#{animal.id}</td>
                    <td style={{ fontWeight: 500 }}>{animal.name || `Animal #${animal.id}`}</td>
                    <td>{animal.breed} · {animal.sex}</td>
                    <td>{animal.weight} kg · {animal.age} m</td>
                    <td style={{ fontSize: '0.875rem' }}>
                      <div>{animal.owner.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{animal.owner.email}</div>
                    </td>
                    <td>
                      {animal.photos.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Sem fotos</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {animal.photos.map(photo => (
                            <a
                              key={photo.id}
                              href={`/api/download?path=${encodeURIComponent(photo.filePath)}`}
                              download
                              className="btn btn-outline btn-sm"
                              style={{ display: 'inline-block', width: 'auto' }}
                            >
                              ↓ Foto #{photo.id}
                            </a>
                          ))}
                        </div>
                      )}
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
