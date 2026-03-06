"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMPTY_CLIENT_VALUE = "__none__";

type Ticket = {
  ticket_id: string;
  external_id: string | null;
  short_desc: string;
  status: string | null;
  priority: string | null;
  is_resolved: boolean;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      setEmail(data.session.user?.email ?? null);
      if (data.session.access_token) {
        loadClients(data.session.access_token);
      }
    });
  }, [supabase, loadClients, router]);

  const loadTickets = useCallback(async () => {
    if (!selectedClient) {
      setTickets([]);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const data_ = await apiClient.get<Ticket[]>("/api/v1/tickets", token, {
        clientId: selectedClient.client_id,
      });
      setTickets(data_);
    } catch (e: unknown) {
      setTicketsError(e instanceof Error ? e.message : "Failed to load tickets");
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, [selectedClient]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Home</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button variant="link" onClick={signOut} className="text-sm p-0 h-auto">
              Sign out
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dashboard-client-select" className="text-sm font-medium text-muted-foreground">
            Client
          </Label>
          {loading ? (
            <span className="text-sm text-muted-foreground block">Loading clients…</span>
          ) : (
            <Select
              value={selectedClient?.client_id ?? EMPTY_CLIENT_VALUE}
              onValueChange={handleClientChange}
            >
              <SelectTrigger id="dashboard-client-select" className="min-w-[160px] w-[160px]">
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

        {error && <p className="text-destructive text-sm">{error}</p>}

        {selectedClient ? (
          <div className="mt-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tickets for {selectedClient.name}</h2>
              <Link
                href="/upload_tickets"
                className="inline-flex items-center rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                Upload
              </Link>
            </div>
            {ticketsError && (
              <p className="text-red-600 text-sm">{ticketsError}</p>
            )}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                {ticketsLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading tickets…
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No tickets yet.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          External ID
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Summary
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {tickets.map((t) => (
                        <tr key={t.ticket_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {t.external_id ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <Link
                              href={`/tickets/${t.ticket_id}`}
                              className="font-medium text-gray-900 hover:text-gray-700 hover:underline"
                            >
                              {t.short_desc}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className={t.is_resolved ? "text-gray-500" : "text-amber-600 font-medium"}>
                              {t.status ?? (t.is_resolved ? "CLOSED" : "OPEN")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a client from the dropdown above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
