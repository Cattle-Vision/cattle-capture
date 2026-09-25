'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminPage() {
  const [animals, setAnimals] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/animals')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setAnimals(data);
      })
      .catch(console.error);
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>Painel Administrativo</h1>
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>Voltar ao Início</Link>
      </header>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#374151' }}>Registros Recentes de Captura</h2>
        
        {animals.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Nenhum animal cadastrado ainda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem' }}>ID</th>
                <th style={{ padding: '0.75rem' }}>Raça</th>
                <th style={{ padding: '0.75rem' }}>Peso (kg)</th>
                <th style={{ padding: '0.75rem' }}>Fotos</th>
              </tr>
            </thead>
            <tbody>
              {animals.map((animal) => (
                <tr key={animal.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem' }}>{animal.id}</td>
                  <td style={{ padding: '0.75rem' }}>{animal.breed}</td>
                  <td style={{ padding: '0.75rem' }}>{animal.weight}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {animal.photos?.length > 0 ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {animal.photos.map((photo: any) => (
                          <a 
                            key={photo.id}
                            href={`/api/download?path=${photo.filePath}`} // Será tratado pelo backend ou next/server
                            download
                            style={{ padding: '0.25rem 0.5rem', backgroundColor: '#e5e7eb', borderRadius: '4px', textDecoration: 'none', color: '#111827', fontSize: '0.875rem' }}
                          >
                            Baixar Foto
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Sem fotos</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
