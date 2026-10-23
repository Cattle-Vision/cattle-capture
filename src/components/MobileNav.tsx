"use client";

/**
 * Barra de Navegação Inferior Mobile (`src/components/MobileNav.tsx`).
 *
 * Projetada para operação ergonômica com uma mão no celular (PWA e navegadores móveis),
 * respeitando a `safe-area-inset-bottom` do iOS/Android.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ScanLine, PlusCircle, ShieldCheck } from "lucide-react";

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  const items = [
    {
      href: "/dashboard",
      label: "Rebanho",
      icon: LayoutGrid,
      active: pathname === "/dashboard",
    },
    {
      href: "/identify",
      label: "Identificar",
      icon: ScanLine,
      active: pathname.startsWith("/identify"),
    },
    {
      href: "/animal/new",
      label: "Cadastrar",
      icon: PlusCircle,
      active: pathname === "/animal/new",
    },
    ...(isAdmin
      ? [
          {
            href: "/admin",
            label: "Admin",
            icon: ShieldCheck,
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Navegação principal mobile"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-30 glass-header border-t border-b-0 px-2 pt-1 flex items-center justify-center"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
                item.active
                  ? "text-emerald-600 dark:text-emerald-400 font-bold"
                  : "text-theme-muted hover:text-theme-primary font-medium"
              }`}
            >
              <Icon className={`w-4 h-4 ${item.active ? "stroke-[2.2]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileNav;
