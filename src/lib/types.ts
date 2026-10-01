/**
 * Tipos centrais do domínio cattle-capture.
 * Evita o uso de `any` em todo o projeto e serve como contrato entre
 * frontend e as respostas da API (Prisma retorna estes shapes).
 */

export interface Photo {
  id: string;
  animalId?: string;
  /** Caminho relativo salvo no banco: `/storage/uploads/<filename>` */
  filePath: string;
  createdAt?: string; // ISO string após serialização JSON
}

export interface Animal {
  id: string;
  name: string;
  breed: string;
  sex: string;
  weight: number;
  age: number;
  ownerId: number;
  photos: Photo[];
}

export interface AnimalWithOwner extends Animal {
  owner: {
    name: string;
    email: string;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

/**
 * Converte o filePath armazenado no banco em uma URL de API segura.
 * Ex: `/storage/uploads/foo.jpg` → `/api/storage/uploads/foo.jpg`
 *
 * Esta função é o ponto único de verdade para geração de URLs de imagem.
 * Todos os componentes devem chamá-la ao renderizar <img>.
 */
export function filePathToUrl(filePath: string): string {
  // Remove a barra inicial se existir e prefixa com /api/storage/
  const relative = filePath.replace(/^\//, '');
  return `/api/${relative}`;
}
