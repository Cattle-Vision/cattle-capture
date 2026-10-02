export interface Photo {
  id: string;
  animalId?: string;
  filePath: string;
  view?: string;
  createdAt?: string;
}

export interface Animal {
  id: string;
  tag: string;
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

export function filePathToUrl(filePath: string): string {
  const relative = filePath.replace(/^\//, "");
  return `/api/${relative}`;
}
