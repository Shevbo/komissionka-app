"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { trackActivity, heartbeat, type ActivityAction } from "komiss/lib/activity";

type ActivityContextValue = {
  trackAction: (actionType: ActivityAction, detailsOrEntityId?: string | Record<string, string>) => void;
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const trackRef = useRef(false);

  const trackAction = useCallback((actionType: ActivityAction, detailsOrEntityId?: string | Record<string, string>) => {
    trackActivity(actionType, detailsOrEntityId).catch(() => {});
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      heartbeat().catch(() => {});
    }
  }, [pathname, status]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href*="/items/"]');
      if (link && link.getAttribute("href")?.match(/\/items\/([a-f0-9-]+)/i)) {
        const id = link.getAttribute("href")?.match(/\/items\/([a-f0-9-]+)/i)?.[1];
        if (id && !trackRef.current) {
          trackRef.current = true;
          trackActivity("product_click", id).finally(() => {
            trackRef.current = false;
          });
        }
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return (
    <ActivityContext.Provider value={{ trackAction }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  return ctx ?? { trackAction: () => {} };
}
