import Link from "next/link";

/**
 * Minimal admin section navigation: Pembeli, Batubara, Penawaran Pembeli and
 * Transaksi - and deliberately nothing more: no dashboard, no nested menu.
 *
 * A tiny server component so every admin page can render it without
 * duplicating the markup. The active section is passed in (the component
 * deliberately reads no route state, keeping it a plain link bar).
 */

export type AdminSection = "buyers" | "listings" | "offers" | "transactions";

const SECTIONS: readonly { key: AdminSection; href: string; label: string }[] = [
  { key: "buyers", href: "/admin/buyers", label: "Pembeli" },
  { key: "listings", href: "/admin/listings", label: "Batubara" },
  { key: "offers", href: "/admin/quote-requests", label: "Penawaran Pembeli" },
  { key: "transactions", href: "/admin/transactions", label: "Transaksi" },
];

export function AdminNav({ active }: { active: AdminSection }) {
  return (
    <nav
      aria-label="Bagian admin"
      className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 pb-3 dark:border-slate-800"
    >
      {SECTIONS.map((section) => {
        const isActive = section.key === active;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                : "rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}