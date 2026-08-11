import { Category } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface ICategorySafe {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  parent?: ICategorySafe | null;
  children?: ICategorySafe[];
}

export abstract class ICategoriesRepository {
  abstract findAll(includeInactive?: boolean): Promise<ICategorySafe[]>;
  abstract findTree(): Promise<ICategorySafe[]>;
  abstract findById(id: string): Promise<ICategorySafe>;
  abstract findBySlug(slug: string): Promise<ICategorySafe | null>;
  abstract create(data: Prisma.CategoryCreateInput): Promise<Category>;
  abstract update(id: string, data: Prisma.CategoryUpdateInput): Promise<ICategorySafe>;
  abstract remove(id: string): Promise<void>;
}
