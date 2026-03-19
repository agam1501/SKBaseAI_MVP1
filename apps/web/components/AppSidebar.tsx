"use client";

import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart2,
  LayoutDashboard,
  Tag,
  TrendingUp,
  Upload,
  Users2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UserRole } from "@/lib/types";

const NAV_ITEMS = [
  { label: "Overview", href: "/overview", icon: BarChart2, roles: null },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: null,
  },
  {
    label: "Ingestion",
    href: "/ingestion",
    icon: Upload,
    roles: ["Admin", "Developer"] as UserRole["role"][],
  },
  {
    label: "Users",
    href: "/users",
    icon: Users2,
    roles: ["Admin", "Developer"] as UserRole["role"][],
  },
  { label: "Analytics", href: "/analytics", icon: TrendingUp, roles: null },
  { label: "Taxonomies", href: "/taxonomies", icon: Tag, roles: null },
];

export function AppSidebar({
  onResizeStart,
}: {
  onResizeStart: (e: React.MouseEvent) => void;
}) {
  const pathname = usePathname();
  const [supabase, setSupabase] = useState<ReturnType<
    typeof createClient
  > | null>(null);
  useEffect(() => {
    setSupabase(createClient());
  }, []);
  const [role, setRole] = useState<UserRole["role"] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const me = await apiClient.get<UserRole>(
          "/api/v1/me/role",
          data.session.access_token,
        );
        setRole(me.role);
      } catch {
        // Default: no elevated role — hide gated items
      }
    });
  }, [supabase]);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    // While role is still loading (null), show all items optimistically.
    // Once resolved, hide items the role isn't allowed.
    if (!role) return true;
    return item.roles.includes(role);
  });

  return (
    <Sidebar collapsible="icon" className="relative">
      <SidebarHeader className="px-4 py-3">
        <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
          SKBaseAI
        </span>
        <span className="font-semibold text-lg hidden group-data-[collapsible=icon]:block">
          SK
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="group-data-[collapsible=icon]:block hidden"
                      >
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-3">
        <SidebarTrigger className="ml-auto" />
      </SidebarFooter>

      {/* Drag-to-resize handle */}
      <div
        className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-border transition-colors z-10 group-data-[collapsible=icon]:hidden"
        onMouseDown={onResizeStart}
      />
    </Sidebar>
  );
}
