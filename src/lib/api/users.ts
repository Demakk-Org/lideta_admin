import { db } from '@/lib/firebase/config';
import { collection, deleteField, doc, getDocs, query, updateDoc, type UpdateData } from 'firebase/firestore';

export enum UserRole {
  Admin = 'ADMIN',
}

export type UserDoc = {
  name: string;
  email: string; // not editable via admin UI
  age?: number;
  imageUrl?: string;
  role?: UserRole; // undefined => not admin
};

export type WithId<T> = T & { id: string };

const colRef = collection(db, 'users');

function normalizeNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeRole(val: unknown): UserRole | undefined {
  const s = String(val ?? '').toUpperCase();
  return s === UserRole.Admin ? UserRole.Admin : undefined;
}

export async function listUsers(): Promise<WithId<UserDoc>[]> {
  try {
    const snap = await getDocs(query(colRef));
    const items = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const it: UserDoc = {
        name: String(data['name'] ?? ''),
        email: String(data['email'] ?? ''),
        age: normalizeNumber(data['age']),
        imageUrl: typeof data['imageUrl'] === 'string' ? (data['imageUrl'] as string) : undefined,
        role: normalizeRole(data['role']),
      };
      return { id: d.id, ...it } as WithId<UserDoc>;
    });
    return items;
  } catch (err) {
    console.error('[usersApi] listUsers error', err);
    throw new Error('Failed to list users');
  }
}

export async function updateUser(id: string, data: Partial<UserDoc>): Promise<void> {
  try {
    // Do not allow editing email via admin UI
    if (Object.prototype.hasOwnProperty.call(data, 'email')) {
      delete (data as Record<string, unknown>).email;
    }
    const toWrite: UpdateData<UserDoc> = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name')) toWrite.name = String(data.name ?? '');
    if (Object.prototype.hasOwnProperty.call(data, 'age')) {
      const n = normalizeNumber((data as Record<string, unknown>)['age']);
      toWrite.age = typeof n === 'number' ? n : (deleteField() as any);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'imageUrl')) {
      const v = (data as Record<string, unknown>)['imageUrl'];
      toWrite.imageUrl = typeof v === 'string' ? (v as string) : (deleteField() as any);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'role')) {
      const r = normalizeRole((data as Record<string, unknown>)['role']);
      // If not ADMIN, remove role field to represent non-admin
      toWrite.role = r ? r : (deleteField() as any);
    }
    await updateDoc(doc(colRef, id), toWrite);
  } catch (err) {
    console.error('[usersApi] updateUser error', err);
    throw new Error('Failed to update user');
  }
}
