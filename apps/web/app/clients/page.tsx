"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SelectClientPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      await loadClients(data.session.access_token);
    });
  }, [supabase, loadClients, router]);

  async function handleRefresh() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return router.push("/login");
    await loadClients(token);
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Select client</h1>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <h2 className="font-semibold">Your clients</h2>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients yet.</p>
            ) : (
              <div className="space-y-2">
                {clients.map((c) => (
                  <Button
                    key={c.client_id}
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left h-auto py-2",
                      selectedClient?.client_id === c.client_id && "border-primary bg-secondary"
                    )}
                    onClick={() => setSelectedClient(c)}
                  >
                    <div className="w-full">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.client_id}</div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/clients/add">Add client</Link>
          </Button>
          {selectedClient && (
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
