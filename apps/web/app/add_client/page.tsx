"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function AddClientPage() {
  const router = useRouter();
  const supabase = createClient();
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length >= 2 && !submitting, [name, submitting]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      await loadClients(data.session.access_token);
    });
  }, [loadClients, router, supabase]);

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
        { name: name.trim() }
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Add client</h1>
          <a href="/dashboard" className="text-sm underline text-gray-500">
            ← Back
          </a>
        </div>

        {(error || localError) && (
          <p className="text-red-600 text-sm">{error ?? localError}</p>
        )}

        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <h2 className="font-semibold">Add a client</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className="flex-1 min-w-[220px] rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={createNewClient}
              disabled={!canSubmit}
              className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Creating a client automatically grants you access.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold">Your clients</h2>
            <button
              className="text-sm underline text-gray-600"
              onClick={async () => {
                const { data } = await supabase.auth.getSession();
                const token = data.session?.access_token;
                if (!token) return router.push("/login");
                await loadClients(token);
              }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-gray-500">No clients yet.</p>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => (
                <button
                  key={c.client_id}
                  onClick={() => setSelectedClient(c)}
                  className={`w-full text-left rounded border px-3 py-2 text-sm ${
                    selectedClient?.client_id === c.client_id
                      ? "border-black bg-gray-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.client_id}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
