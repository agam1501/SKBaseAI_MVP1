"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/taxonomies", label: "Overview" },
  { href: "/taxonomies/business-category", label: "Business category" },
  { href: "/taxonomies/application", label: "Application" },
  { href: "/taxonomies/resolution", label: "Resolution" },
  { href: "/taxonomies/root-cause", label: "Root cause" },
];

export default function TaxonomiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Taxonomies</h1>
          <nav className="flex items-center gap-1 flex-wrap">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
