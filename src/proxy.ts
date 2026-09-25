import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const role = request.cookies.get('user-role')?.value;
  const path = request.nextUrl.pathname;

  // Redirecionar usuário logado para fora das páginas de auth
  if ((path === '/login' || path === '/register') && token) {
    return NextResponse.redirect(new URL(role === 'ADMIN' ? '/admin' : '/dashboard', request.url));
  }

  // Proteger dashboard e câmera
  if ((path.startsWith('/dashboard') || path.startsWith('/camera')) && !token) {
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
