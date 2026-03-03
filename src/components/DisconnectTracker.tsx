"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "komiss/components/auth-provider";
import { getOrCreateSessionId } from "komiss/lib/session-id";

const API_ACTIVITY = "/api/activity";

export function DisconnectTracker() {
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    function handleUnload() {
      const details: Record<string, string> = {};
      if (!userIdRef.current && typeof window !== "undefined") {
        details.session_id = getOrCreateSessionId();
      }
      const payload = {
        action_type: "DISCONNECT",
        details,
        user_id: userIdRef.current,
      };
      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      navigator.sendBeacon(API_ACTIVITY, blob);
    }

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, []);

  return null;
}
