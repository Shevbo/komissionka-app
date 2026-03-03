import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "komiss/components/auth-provider";
import { ActivityProvider } from "komiss/components/ActivityProvider";
import { DisconnectTracker } from "komiss/components/DisconnectTracker";
import { Navbar } from "komiss/components/Navbar";
import { CartHydrator } from "komiss/components/CartHydrator";

export const metadata: Metadata = {
  title: "Комиссионка — Вторая жизнь ваших вещей",
  description:
    "Покупайте и продавайте личные вещи просто и безопасно.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <AuthProvider>
          <ActivityProvider>
            <DisconnectTracker />
            <CartHydrator />
            <Navbar />
          {children}
            <Toaster richColors position="top-right" />
          </ActivityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
