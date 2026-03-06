"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AddClientPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const {
    clients,
    selectedClient,
    setSelectedClient,
    loadClients,
    loading,
    error,
  } = useClientContext();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length >= 2 && !submitting,
    [name, submitting],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      await loadClients(data.session.access_token);
    });
  }, [supabase, loadClients, router]);

  async function createNewClient() {
    setSubmitting(true);
    setLocalError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return router.push("/login");

      const created = await apiClient.post<{ client_id: string; name: string }>(
        "/api/v1/clients",
        token,
        { name: name.trim() },
      );

      await loadClients(token);
      setSelectedClient(created);
      setName("");
      router.push("/dashboard");
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return router.push("/login");
    await loadClients(token);
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Add client</h1>
          <Button
            variant="link"
            className="text-muted-foreground p-0 h-auto"
            asChild
          >
            <Link href="/dashboard">← Back</Link>
          </Button>
        </div>

        {(error || localError) && (
          <p className="text-destructive text-sm">{error ?? localError}</p>
        )}

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Add a client</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client name"
                className="flex-1 min-w-[220px]"
              />
              <Button onClick={createNewClient} disabled={!canSubmit}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Creating a client automatically grants you access.
            </p>
          </CardContent>
        </Card>

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
                      selectedClient?.client_id === c.client_id &&
                        "border-primary bg-secondary",
                    )}
                    onClick={() => setSelectedClient(c)}
                  >
                    <div className="w-full">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.client_id}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
