"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type TicketUploadResult } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function TicketsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { clients, selectedClient, setSelectedClient, loadClients, loading: clientsLoading, error: clientsError } =
    useClientContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<TicketUploadResult | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.push("/login");
      const token = data.session.access_token;
      if (!token) return;
      await loadClients(token);
    });
  }, [supabase, loadClients, router]);

  const loadTickets = useCallback(async () => {
    if (!selectedClient) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
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
  }, [selectedClient]);

  function handleClientChange(value: string) {
    if (value === EMPTY_CLIENT_VALUE) {
      setSelectedClient(null);
    } else {
      const client = clients.find((c) => c.client_id === value) ?? null;
      setSelectedClient(client);
    }
  }

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleUpload = async () => {
    if (!selectedClient || !uploadFile) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const result = await apiClient.uploadTickets(
        "/api/v1/tickets/upload",
        token,
        uploadFile,
        { clientId: selectedClient.client_id }
      );
      setUploadResult(result);
      if (result.created > 0) await loadTickets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

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

        {selectedClient && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Upload tickets (CSV)</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".csv"
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] ?? null);
                  setUploadResult(null);
                }}
              />
              <button
                type="button"
                disabled={!uploadFile || uploading}
                onClick={handleUpload}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
            {uploadResult && (
              <div className="text-sm space-y-1">
                {uploadResult.created > 0 && (
                  <p className="text-green-700 font-medium">
                    Created {uploadResult.created} ticket{uploadResult.created !== 1 ? "s" : ""}.
                  </p>
                )}
                {uploadResult.errors.length > 0 && (
                  <div>
                    <p className="text-amber-700 font-medium">Row errors:</p>
                    <ul className="list-disc list-inside text-amber-800 mt-0.5">
                      {uploadResult.errors.map((err, i) => (
                        <li key={i}>
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!selectedClient && !clientsLoading && (
          <p className="text-muted-foreground text-sm">Select a client to view tickets.</p>
        )}

        {selectedClient && tickets.length === 0 && !error && (
          <p className="text-muted-foreground text-sm">No tickets yet.</p>
        )}

        {selectedClient && tickets.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
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
                      Priority
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
                        <span
                          className={
                            t.is_resolved
                              ? "text-gray-500"
                              : "text-amber-600 font-medium"
                          }
                        >
                          {t.status ?? (t.is_resolved ? "CLOSED" : "OPEN")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {t.priority ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
