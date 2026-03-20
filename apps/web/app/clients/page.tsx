"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export default function SelectClientPage() {
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      await loadClients(data.session.access_token);
    });
  }, [supabase, loadClients, router]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.push("/login");
      return null;
    }
    return token;
  }

  async function handleRefresh() {
    const token = await getToken();
    if (token) await loadClients(token);
  }

  function startEditing(clientId: string, currentName: string) {
    setEditingId(clientId);
    setEditName(currentName);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
  }

  async function handleRename(clientId: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    const current = clients.find((c) => c.client_id === clientId);
    if (current && current.name === trimmed) {
      cancelEditing();
      return;
    }

    const token = await getToken();
    if (!token) return;

    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/clients/${clientId}`, token, {
        name: trimmed,
      });
      toast.success("Client renamed");
      if (selectedClient?.client_id === clientId) {
        setSelectedClient({ ...selectedClient, name: trimmed });
      }
      await loadClients(token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rename failed";
      toast.error(msg);
    } finally {
      setSaving(false);
      setEditingId(null);
      setEditName("");
    }
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
                  <div
                    key={c.client_id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2",
                      selectedClient?.client_id === c.client_id &&
                        "border-primary bg-secondary",
                    )}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => setSelectedClient(c)}
                    >
                      {editingId === c.client_id ? (
                        <Input
                          ref={inputRef}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(c.client_id);
                            if (e.key === "Escape") cancelEditing();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={saving}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.client_id}
                          </div>
                        </>
                      )}
                    </button>
                    {editingId === c.client_id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={saving || !editName.trim()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(c.client_id);
                          }}
                        >
                          {saving ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={saving}
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditing();
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(c.client_id, c.name);
                        }}
                      >
                        Edit name
                      </Button>
                    )}
                  </div>
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
