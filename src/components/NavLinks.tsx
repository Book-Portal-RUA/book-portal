"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Highlights the section you are in. Split out of Nav because knowing the
 * current path needs the client, while the session lookup needs the server.
 */
export default function NavLinks({
  canUpload,
  canAdmin,
  canDelete,
  trashCount,
}: {
  canUpload: boolean;
  canAdmin: boolean;
  canDelete: boolean;
  trashCount: number;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/books", label: "Catalogue" },
    ...(canUpload ? [{ href: "/upload", label: "Add a book" }] : []),
    // Storage sets the year folder for the whole library, so it is an admin
    // screen now rather than something every uploader has to visit first.
    ...(canAdmin ? [{ href: "/storage", label: "Storage" }] : []),
    ...(canDelete ? [{ href: "/trash", label: "Trash" }] : []),
  ];

  return (
    <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-2.5 ${
              active ? "bg-tint text-signal-deep" : "text-ink-soft hover:text-ink"
            }`}
          >
            {link.label}
            {/* Only worth a badge when there is something to recover before
                it auto-purges - an empty Trash needs no visual weight. */}
            {link.href === "/trash" && trashCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                  active ? "bg-signal text-white" : "bg-husk text-ink-soft"
                }`}
              >
                {trashCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}