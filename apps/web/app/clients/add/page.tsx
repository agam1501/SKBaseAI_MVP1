"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function AddClientPage() {
  const router = useRouter();
  const supabase = createClient();
  const { setSelectedClient, loadClients, error } = useClientContext();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length >= 2 && !submitting, [name, submitting]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
    });
  }, [router]);

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
      router.push("/clients");
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
          <a href="/clients" className="text-sm underline text-gray-500">
            ← Back to Select client
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
      </div>
    </div>
  );
}
