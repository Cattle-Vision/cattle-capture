import { cookies } from 'next/headers';

export async function getSession() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('auth-token')?.value;
  const role = cookieStore.get('user-role')?.value;

  if (!userId) {
    return { userId: null, role: null };
  }

  return { userId: Number(userId), role: role || 'USER' };
}
