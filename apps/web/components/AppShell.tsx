"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256; // 16rem

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      function onMouseMove(ev: MouseEvent) {
        const newWidth = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, startWidth + ev.clientX - startX),
        );
        setSidebarWidth(newWidth);
      }

      function onMouseUp() {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <AppSidebar onResizeStart={handleResizeStart} />
      <SidebarInset>
        <TopNav />
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
