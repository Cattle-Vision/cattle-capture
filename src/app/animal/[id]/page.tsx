'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ArrowLeft } from 'lucide-react';

export default function AnimalProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [animal, setAnimal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/animals/${id}`)
      .then(res => res.json())
      .then(data => {
        setAnimal(data);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [id]);

  const deletePhoto = async (photoId: number) => {
    if (!confirm('Tem certeza que quer apagar esta foto?')) return;
    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    if (res.ok) {
      setAnimal((prev: any) => ({
        ...prev,
        photos: prev.photos.filter((p: any) => p.id !== photoId)
      }));
    } else {
      alert('Erro ao apagar');
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Carregando dados do animal...</div>;
  if (!animal) return <div className="p-8 text-center text-red-500">Animal não encontrado ou acesso negado.</div>;

  return (
    <div className="min-h-[100dvh] bg-zinc-50 flex flex-col">
      <header className="bg-white border-b px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')} className="p-2 rounded hover:bg-zinc-100 transition">
          <ArrowLeft className="w-5 h-5 text-zinc-700" />
        </button>
        <h1 className="text-lg font-bold">Animal #{animal.id}</h1>
        <div className="w-8" />
      </header>

      <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full flex flex-col gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h2 className="text-2xl font-bold mb-2">{animal.name || 'Sem nome'}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-zinc-600">
             <div><strong className="block text-zinc-400">Raça</strong>{animal.breed}</div>
             <div><strong className="block text-zinc-400">Sexo</strong>{animal.sex}</div>
             <div><strong className="block text-zinc-400">Peso</strong>{animal.weight} kg</div>
             <div><strong className="block text-zinc-400">Idade</strong>{animal.age} meses</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-zinc-800">Galeria de Fotos ({animal.photos?.length || 0})</h3>
            <Link 
              href={`/camera?animalId=${animal.id}`}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm shadow hover:bg-green-700"
            >
              + Adicionar Foto
            </Link>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
             {animal.photos?.map((p: any) => (
                <div key={p.id} className="relative aspect-[3/4] bg-zinc-200 rounded-lg overflow-hidden shadow-sm border border-black/5 group">
                   {/* Aqui usariamos <img /> mas como estamos lidando com URL public route, vamos por tag direta */}
                   <img src={p.filePath} alt="Foto" className="object-cover w-full h-full" />
                   
                   <button 
                     onClick={() => deletePhoto(p.id)}
                     className="absolute top-2 right-2 bg-red-600/90 text-white p-2 rounded-full opacity-100 sm:opacity-0 group-hover:opacity-100 transition shadow-lg backdrop-blur-sm"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
             ))}
             {!animal.photos?.length && (
               <div className="col-span-full py-8 text-center text-zinc-400 bg-white border border-dashed rounded-lg">
                 Nenhuma foto cadastrada ainda.
               </div>
             )}
          </div>
        </div>
      </main>
    </div>
  );
}
