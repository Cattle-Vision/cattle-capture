/**
 * Configuração Edge-compatible do NextAuth (`src/lib/auth.config.ts`).
 *
 * Responsabilidades:
 * - Proteger rotas autenticadas (`/dashboard`, `/camera`, `/animal`, `/identify`).
 * - Garantir controle de acesso baseado em papel (RBAC) para `/admin` (`role === "ADMIN"`).
 * - Propagar `id` e `role` no token JWT e no objeto `session.user`.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isAdmin = (auth?.user as { role?: string } | undefined)?.role === "ADMIN";

      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/api/auth");

      if (isPublic) {
        if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        if (pathname.startsWith("/api/")) return false;
        const login = new URL("/login", request.nextUrl);
        login.searchParams.set("callbackUrl", pathname);
        return Response.redirect(login);
      }

      // Proteção exclusiva de rota administrativa
      if (pathname.startsWith("/admin") && !isAdmin) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = (token.role as string) ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
