"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SessionProvider, useSession, signOut as nextAuthSignOut } from "next-auth/react";
import { useCart } from "komiss/store/useCart";
import { trackActivity } from "komiss/lib/activity";

type Profile = { full_name: string | null; avatar_url: string | null; role: string | null; telegram_id?: string | null; telegram_username?: string | null } | null;

type AuthContextValue = {
  user: { id: string; email?: string | null } | null;
  profile: Profile;
  userRole: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  authDialogOpen: boolean;
  setAuthDialogOpen: (open: boolean) => void;
  clearAuth: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthContextInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<Profile>(null);
  const [profileLoadAttempted, setProfileLoadAttempted] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const user = session?.user ? { id: (session.user as { id?: string }).id ?? "", email: session.user.email ?? null } : null;

  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoadAttempted(false);
      return;
    }
    setProfileLoadAttempted(false);
    try {
      const res = await fetch("/api/auth/profile");
      const data = await res.json();
      setProfile(data.profile ?? { full_name: null, avatar_url: null, role: null, telegram_id: null, telegram_username: null });
    } catch {
      setProfile(null);
    } finally {
      setProfileLoadAttempted(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (status === "loading" || !user) {
      setProfile(null);
      setProfileLoadAttempted(false);
      return;
    }
    refreshProfile();
  }, [status, user?.id, refreshProfile]);

  const clearAuth = useCallback(() => {
    setProfile(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await trackActivity("LOGOUT");
    } catch {}
    await nextAuthSignOut({ redirect: false });
    setProfile(null);
    useCart.getState().clearCart();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  const loading = status === "loading" || (!!user && !profileLoadAttempted);
  const userRole = profile?.role ?? null;

  const value = useMemo(
    () => ({
      user,
      profile,
      userRole,
      loading,
      refreshProfile,
      authDialogOpen,
      setAuthDialogOpen,
      clearAuth,
      signOut,
    }),
    [user, profile, userRole, loading, refreshProfile, authDialogOpen, clearAuth, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextInner>{children}</AuthContextInner>
    </SessionProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
