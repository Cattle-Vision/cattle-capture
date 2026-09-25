import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const authToken = request.cookies.get('auth-token');
  const userRole = request.cookies.get('user-role')?.value;
  const path = request.nextUrl.pathname;

  // Proteger o dashboard e camera
  if ((path.startsWith('/camera') || path.startsWith('/dashboard')) && !authToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Proteger o painel de admin
  if (path.startsWith('/admin')) {
    if (!authToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Apenas admins podem acessar
    if (userRole !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Redirecionar usuários logados saindo do login para dashboard
  if ((path === '/login' || path === '/register') && authToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/camera/:path*', '/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
