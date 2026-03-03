import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { trackActivity } from "komiss/lib/activity";

export type CartItem = {
  id: string;
  title: string | null;
  price: number | null;
  image_urls: string[] | null; // Изменено на image_urls
  location: string | null;
};

type CartStore = {
  items: CartItem[];
  addItem: (product: CartItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCart: () => void;
  totalPrice: () => number;
  hydrateFromDb: () => Promise<void>;
};

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: async (product) => {
        const currentItems = get().items;
        if (currentItems.some((i) => i.id === product.id)) return;

        try {
          await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: product.id }),
          });
        } catch (e) {
          console.error("Ошибка корзины:", e);
        }
        set({ items: [...currentItems, product] });
      },

      removeItem: async (id) => {
        try {
          await fetch(`/api/cart/${id}`, { method: "DELETE" });
        } catch (e) {
          console.error("Ошибка корзины:", e);
        }
        set({ items: get().items.filter((item) => item.id !== id) });
        trackActivity("REMOVE_FROM_CART", { product_id: id }).catch(() => {});
      },

      clearCart: () => set({ items: [] }),

      totalPrice: () =>
        get().items.reduce((sum, item) => sum + (item.price ?? 0), 0),

      hydrateFromDb: async () => {
        try {
          const res = await fetch("/api/cart");
          const data = await res.json();
          const items: CartItem[] = Array.isArray(data.items) ? data.items : [];
          set({ items });
        } catch (e) {
          console.error("Ошибка корзины:", e);
        }
      },
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : ({} as Storage)
      ),
    }
  )
);
