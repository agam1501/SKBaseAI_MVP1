"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SelectClientPage() {
  const router = useRouter();
  const supabase = createClient();
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
  }, [loadClients, router]);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Select client</h1>

        {error && <p className="text-red-600 text-sm">{error}</p>}

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

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/clients/add"
            className="inline-flex items-center px-4 py-2.5 border border-gray-300 bg-white text-sm font-medium rounded hover:bg-gray-50"
          >
            Add client
          </a>
          {selectedClient && (
            <a
              href="/dashboard"
              className="inline-flex items-center px-4 py-2.5 bg-black text-white text-sm font-medium rounded hover:opacity-90"
            >
              Go to Dashboard
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
