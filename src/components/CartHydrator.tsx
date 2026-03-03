"use client";

import { useEffect } from "react";
import { useAuth } from "komiss/components/auth-provider";
import { useCart } from "komiss/store/useCart";

export function CartHydrator() {
  const { user } = useAuth();
  const hydrateFromDb = useCart((s) => s.hydrateFromDb);

  useEffect(() => {
    if (user) {
      hydrateFromDb();
    }
  }, [user?.id, hydrateFromDb]);

  return null;
}
