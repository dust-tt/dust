"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: "◈" },
  { href: "/components", label: "Components", icon: "⬡" },
  { href: "/folders", label: "Folders", icon: "⊟" },
  { href: "/tokens", label: "Tokens", icon: "◇" },
  { href: "/reports", label: "Reports", icon: "≡" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-10 flex items-center justify-center h-14 px-6"
    >
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors",
                active
                  ? "text-gray-100"
                  : "text-gray-400 hover:text-gray-100"
              )}
              style={
                active
                  ? {
                      background: "#1a1a1a",
                      border: "1px solid #3d3a39",
                      color: "#f2f2f2",
                    }
                  : undefined
              }
            >
              <span
                className="text-xs"
                style={active ? { color: "#00d992" } : { opacity: 0.5 }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
