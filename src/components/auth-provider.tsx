"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "komiss/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type Profile = { full_name: string | null; avatar_url: string | null } | null;

type AuthContextValue = {
  user: User | null;
  profile: Profile;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  authDialogOpen: boolean;
  setAuthDialogOpen: (open: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const supabase = useMemo(() => createBrowserClient(), []);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single();
    setProfile(data ?? { full_name: null, avatar_url: null });
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      if (user) await fetchProfile();
      else setProfile(null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile();
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      refreshProfile: fetchProfile,
      authDialogOpen,
      setAuthDialogOpen,
    }),
    [user, profile, loading, fetchProfile, authDialogOpen]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
