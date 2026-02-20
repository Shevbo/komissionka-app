import Link from "next/link";
import { UserMenu } from "komiss/components/user-menu";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold">
          Комиссионка
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
