"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const EMPTY_CLIENT_VALUE = "__none__";

type Ticket = {
  ticket_id: string;
  short_desc: string;
  is_resolved: boolean;
  created_at: string;
};

export default function TicketsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
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
  }, [supabase, loadClients, router]);

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
  }, [supabase, selectedClient]);

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
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Tickets</h1>
          {clientsLoading ? (
            <span className="text-sm text-muted-foreground">Loading clients…</span>
          ) : (
            <div className="flex items-center gap-2">
              <Label htmlFor="client-select">Client:</Label>
              <Select
                value={selectedClient?.client_id ?? EMPTY_CLIENT_VALUE}
                onValueChange={handleClientChange}
              >
                <SelectTrigger id="client-select" className="w-[200px]">
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
            </div>
          )}
        </div>

        {(clientsError || error) && (
          <p className="text-destructive text-sm">{clientsError ?? error}</p>
        )}

        {!selectedClient && !clientsLoading && (
          <p className="text-muted-foreground text-sm">Select a client to view tickets.</p>
        )}

        {selectedClient && tickets.length === 0 && !error && (
          <p className="text-muted-foreground text-sm">No tickets yet.</p>
        )}

        {selectedClient &&
          tickets.map((t) => (
            <Link key={t.ticket_id} href={`/tickets/${t.ticket_id}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardContent className="p-4">
                  <p className="font-medium">{t.short_desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.is_resolved ? "Resolved" : "Open"} · {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
