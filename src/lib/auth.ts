/**
 * Autenticação Principal NextAuth + Login Admin via `.env` (`src/lib/auth.ts`).
 *
 * Arquitetura de Autenticação:
 * 1. **Credenciais de Admin no `.env`**:
 *    Lê `ADMIN_EMAIL` (padrão `admin@cattlecapture.com`), `ADMIN_PASSWORD` (padrão `admin123`)
 *    e `ADMIN_NAME` do `.env`. Também aceita o atalho `"admin"` no campo de e-mail/usuário.
 *    Quando o login coincide com o Admin do `.env`, realiza um `upsert` automático na tabela
 *    `User` do PostgreSQL com `role: "ADMIN"`, garantindo que o Admin possua um `id` numérico
 *    válido para criar animais e fotos sem violar chaves estrangeiras (`ownerId`).
 * 2. **Usuários Padrão no PostgreSQL**:
 *    Valida e-mail e hash bcrypt normalmente na tabela `User`. Se o e-mail corresponder ao
 *    `ADMIN_EMAIL`, promove automaticamente para `ADMIN`.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
  }
}

export function getEnvAdminConfig() {
  const email = (
    process.env.ADMIN_EMAIL ||
    process.env.ADMIN_USER ||
    "admin@cattlecapture.com"
  )
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "admin123";
  const name = (process.env.ADMIN_NAME || "Administrador").trim();
  return { email, password, name };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { type: "text" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        const rawIdentifier = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!rawIdentifier || !password) return null;

        const envAdmin = getEnvAdminConfig();

        // Permite entrar digitando o ADMIN_EMAIL completo ou apenas "admin"
        const isEnvAdminIdentifier =
          rawIdentifier === envAdmin.email ||
          rawIdentifier === "admin" ||
          rawIdentifier === "admin@cattlecapture.com";

        // Aceita a senha configurada em ADMIN_PASSWORD (e fallback "admin" caso não customizada)
        const isEnvAdminPassword =
          password === envAdmin.password ||
          (!process.env.ADMIN_PASSWORD && (password === "admin123" || password === "admin"));

        if (isEnvAdminIdentifier && isEnvAdminPassword) {
          try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const adminUser = await prisma.user.upsert({
              where: { email: envAdmin.email },
              update: {
                role: "ADMIN",
                name: envAdmin.name,
              },
              create: {
                email: envAdmin.email,
                name: envAdmin.name,
                password: hashedPassword,
                role: "ADMIN",
              },
            });

            return {
              id: String(adminUser.id),
              email: adminUser.email,
              name: adminUser.name,
              role: "ADMIN",
            };
          } catch (err) {
            console.warn("[auth] Aviso ao sincronizar Admin no banco:", err);
            // Fallback seguro caso o banco esteja temporariamente indisponível
            return {
              id: "1",
              email: envAdmin.email,
              name: envAdmin.name,
              role: "ADMIN",
            };
          }
        }

        // Fluxo normal de autenticação via banco de dados
        const emailToLookup = rawIdentifier === "admin" ? envAdmin.email : rawIdentifier;
        const user = await prisma.user.findUnique({ where: { email: emailToLookup } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        const resolvedRole =
          user.email.toLowerCase() === envAdmin.email ? "ADMIN" : user.role;

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: resolvedRole,
        };
      },
    }),
  ],
});
