"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_CLIENT_VALUE = "__none__";

export function TopNav() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { clients, selectedClient, setSelectedClient, loadClients, loading } =
    useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setEmail(data.session.user?.email ?? null);
      loadClients(data.session.access_token);
      try {
        const me = await apiClient.get<{ role: string }>("/api/v1/me/role", data.session.access_token);
        setRole(me.role);
      } catch {
        // no role assigned
      }
    });
  }, [supabase, loadClients]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleClientChange(value: string) {
    if (value === EMPTY_CLIENT_VALUE) {
      setSelectedClient(null);
    } else {
      const client = clients.find((c) => c.client_id === value) ?? null;
      setSelectedClient(client);
    }
  }

  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-4 shrink-0">
      <div className="flex items-center gap-2">
        {loading ? (
          <span className="text-sm text-muted-foreground">Loading…</span>
        ) : (
          <Select
            value={selectedClient?.client_id ?? EMPTY_CLIENT_VALUE}
            onValueChange={handleClientChange}
          >
            <SelectTrigger className="h-8 min-w-[140px] w-[160px] text-sm">
              <SelectValue placeholder="Select client…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_CLIENT_VALUE}>Select client…</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.client_id} value={c.client_id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-3">
        {email && (
          <span className="text-sm text-muted-foreground hidden sm:block">
            {email}
          </span>
        )}
        {role && <Badge variant="secondary">{role}</Badge>}
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
