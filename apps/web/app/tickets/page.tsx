"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Ticket = {
  ticket_id: string;
  short_desc: string;
  is_resolved: boolean;
  created_at: string;
};

export default function TicketsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { clients, selectedClient, setSelectedClient, loadClients, loading: clientsLoading, error: clientsError } =
    useClientContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.push("/login");
      const token = data.session.access_token;
      if (!token) return;
      await loadClients(token);
    });
  }, [loadClients]);

  useEffect(() => {
    if (!selectedClient) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      setError(null);
      try {
        const data = await apiClient.get<Ticket[]>("/api/v1/tickets", token, {
          clientId: selectedClient.client_id,
        });
        setTickets(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load tickets");
      }
    });
  }, [selectedClient]);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Tickets</h1>
          {clientsLoading ? (
            <span className="text-sm text-gray-500">Loading clients…</span>
          ) : (
            <label className="text-sm text-gray-600 font-medium">
              Client:
              <select
                className="ml-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                value={selectedClient?.client_id ?? ""}
                onChange={(e) => {
                  const c = clients.find((c) => c.client_id === e.target.value);
                  setSelectedClient(c ?? null);
                }}
              >
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {(clientsError || error) && (
          <p className="text-red-600 text-sm">{clientsError ?? error}</p>
        )}

        {!selectedClient && !clientsLoading && (
          <p className="text-gray-500 text-sm">Select a client to view tickets.</p>
        )}

        {selectedClient && tickets.length === 0 && !error && (
          <p className="text-gray-500 text-sm">No tickets yet.</p>
        )}

        {selectedClient &&
          tickets.map((t) => (
            <a
              key={t.ticket_id}
              href={`/tickets/${t.ticket_id}`}
              className="block p-4 bg-white rounded-xl shadow hover:shadow-md transition"
            >
              <p className="font-medium">{t.short_desc}</p>
              <p className="text-xs text-gray-400 mt-1">
                {t.is_resolved ? "Resolved" : "Open"} · {new Date(t.created_at).toLocaleDateString()}
              </p>
            </a>
          ))}
      </div>
    </div>
  );
}
