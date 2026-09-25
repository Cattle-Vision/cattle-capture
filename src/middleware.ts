import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const path = request.nextUrl.pathname;

  let payload = null;
  if (token) {
    payload = await verifyToken(token);
  }

  const role = payload?.role;
  const isLoggedIn = !!payload;

  // Redirecionar usuário logado para fora das páginas de auth
  if ((path === '/login' || path === '/register') && isLoggedIn) {
    return NextResponse.redirect(new URL(role === 'ADMIN' ? '/admin' : '/dashboard', request.url));
  }

  // Proteger dashboard e câmera
  if ((path.startsWith('/dashboard') || path.startsWith('/camera')) && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Proteger admin
  if (path.startsWith('/admin') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/register', '/dashboard/:path*', '/camera/:path*', '/admin/:path*'],
};