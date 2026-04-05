import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "komiss/lib/prisma";
import { mapPortalRoleToKomissionkaProfileRole } from "komiss/lib/map-portal-role";
import { verifyShectoryPortalCredentials } from "komiss/lib/shectory-portal-auth";

function useShectoryPortalCatalog(): boolean {
  return Boolean(process.env.SHECTORY_AUTH_BRIDGE_SECRET?.trim());
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const emailNorm = credentials.email.trim().toLowerCase();
        const password = credentials.password;

        if (useShectoryPortalCatalog()) {
          /** При мосте портала источник истины — только каталог Shectory: локальный bcrypt не используется. */
          const portal = await verifyShectoryPortalCredentials(emailNorm, password);
          if (!portal) return null;

          const profileRole = mapPortalRoleToKomissionkaProfileRole(portal.role);
          const emailLower = portal.email.trim().toLowerCase();
          const nameFromPortal = portal.fullName.trim() || null;

          const existing = await prisma.users.findFirst({
            where: { email: emailLower },
            select: { id: true },
          });

          if (existing) {
            await prisma.$transaction([
              prisma.users.update({
                where: { id: existing.id },
                data: { email: emailLower, encrypted_password: null },
              }),
              prisma.profiles.upsert({
                where: { id: existing.id },
                create: {
                  id: existing.id,
                  email: emailLower,
                  role: profileRole,
                  full_name: nameFromPortal,
                },
                update: {
                  email: emailLower,
                  role: profileRole,
                  ...(nameFromPortal ? { full_name: nameFromPortal } : {}),
                },
              }),
            ]);
            return { id: existing.id, email: emailLower };
          }

          const id = randomUUID();
          await prisma.$transaction([
            prisma.users.create({
              data: {
                id,
                email: emailLower,
                encrypted_password: null,
                email_confirmed_at: new Date(),
                is_sso_user: false,
              },
            }),
            prisma.profiles.create({
              data: {
                id,
                email: emailLower,
                role: profileRole,
                full_name: nameFromPortal,
              },
            }),
          ]);
          return { id, email: emailLower };
        }

        const row = await prisma.users.findFirst({
          where: { email: emailNorm },
          select: { id: true, email: true, encrypted_password: true },
        });

        if (!row?.encrypted_password) return null;
        const ok = await bcrypt.compare(password, row.encrypted_password);
        if (!ok) return null;
        return { id: row.id, email: row.email ?? emailNorm };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        session.user.email = token.email ?? null;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET ?? "komiss-dev-secret-change-in-production",
};
