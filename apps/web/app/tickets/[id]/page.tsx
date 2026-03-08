"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ReactNode } from "react";

type Taxonomy = {
  id: string;
  taxonomy_type: string | null;
  l1: string | null;
  l2: string | null;
  l3: string | null;
  node: string | null;
  confidence_score: number | null;
  source: string | null;
};

const TAXONOMY_LABELS: Record<string, string> = {
  business_category: "Business",
  application: "Application",
  root_cause: "Root Cause",
  resolution: "Resolution",
};

const TAXONOMY_FIELD_PREFIX: Record<string, string> = {
  business_category: "Business",
  application: "Application",
  root_cause: "Root Cause",
  resolution: "Resolution",
};

const TAXONOMY_ORDER = ["business_category", "application", "root_cause", "resolution"];

type Ticket = {
  ticket_id: string;
  client_id: string;
  external_id: string | null;
  source_system: string | null;
  short_desc: string;
  full_desc: string | null;
  cleaned_text: string | null;
  resolution: string | null;
  root_cause: string | null;
  status: string | null;
  priority: string | null;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient } = useClientContext();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!selectedClient) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return router.push("/login");

      try {
        const t = await apiClient.get<Ticket>(`/api/v1/tickets/${id}`, token, {
          clientId: selectedClient.client_id,
        });
        setTicket(t);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load ticket");
      }

      try {
        const tax = await apiClient.get<Taxonomy[]>(
          `/api/v1/taxonomies/tickets/${id}`,
          token,
          { clientId: selectedClient.client_id },
        );
        setTaxonomies(tax);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[taxonomy fetch]", msg, { ticketId: id, clientId: selectedClient.client_id });
        setTaxonomyError(msg);
      }
    });
  }, [id, supabase, selectedClient, router]);

  async function handleToggleStatus() {
    if (!ticket) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const newIsResolved = !ticket.is_resolved;
    const newStatus = newIsResolved ? "CLOSED" : "OPEN";
    setToggling(true);
    try {
      const updated = await apiClient.patch<Ticket>(
        `/api/v1/tickets/${id}/status`,
        token,
        { status: newStatus, is_resolved: newIsResolved },
        { clientId: selectedClient?.client_id },
      );
      setTicket(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setToggling(false);
    }
  }

  if (!selectedClient)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Select a client first.
      </div>
    );
  if (!ticket)
    return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  const statusLabel = ticket.status ?? (ticket.is_resolved ? "CLOSED" : "OPEN");
  const statusColor = ticket.is_resolved
    ? "text-gray-500"
    : "text-amber-600 font-medium";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="link"
          className="text-muted-foreground p-0 h-auto"
          asChild
        >
          <Link href="/dashboard">← Back</Link>
        </Button>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold">{ticket.short_desc}</h1>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </p>
                <div className="flex items-center gap-3">
                  <p className={`text-sm ${statusColor}`}>{statusLabel}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleStatus}
                    disabled={toggling}
                  >
                    {toggling
                      ? "Updating…"
                      : ticket.is_resolved
                        ? "Reopen"
                        : "Close"}
                  </Button>
                </div>
              </div>
              <Field label="Priority" value={ticket.priority} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="External ID" value={ticket.external_id} />
              <Field label="Source System" value={ticket.source_system} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Created"
                value={new Date(ticket.created_at).toLocaleString()}
              />
              <Field
                label="Updated"
                value={new Date(ticket.updated_at).toLocaleString()}
              />
            </div>

            {ticket.resolved_at && (
              <Field
                label="Resolved At"
                value={new Date(ticket.resolved_at).toLocaleString()}
              />
            )}

            <Field label="Short Description" value={ticket.short_desc} />

            {ticket.full_desc && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Full Description
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {ticket.full_desc}
                </p>
              </div>
            )}

            {ticket.root_cause && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Root Cause
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {ticket.root_cause}
                </p>
              </div>
            )}

            {ticket.resolution && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Resolution
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {ticket.resolution}
                </p>
              </div>
            )}

            {ticket.cleaned_text && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cleaned Text
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {ticket.cleaned_text}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-bold">Taxonomies</h2>
          </CardHeader>
          <CardContent>
            {taxonomyError && (
              <p className="text-sm text-destructive mb-3">
                Failed to load taxonomies: {taxonomyError}
              </p>
            )}
            {!taxonomyError && taxonomies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No taxonomies assigned yet.</p>
            ) : !taxonomyError && (
              <div className="space-y-5">
                {TAXONOMY_ORDER.filter((type) =>
                  taxonomies.some((t) => t.taxonomy_type === type)
                ).map((type) => {
                  const entries = taxonomies.filter((t) => t.taxonomy_type === type);
                  return (
                    <div key={type} className="space-y-2">
                      <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        {TAXONOMY_LABELS[type] ?? type}
                      </p>
                      {entries.map((t) => {
                        const prefix = TAXONOMY_FIELD_PREFIX[type] ?? type;
                        return (
                          <div key={t.id} className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {t.l1 && <Field label={`${prefix} L1`} value={t.l1} />}
                            {t.l2 && <Field label={`${prefix} L2`} value={t.l2} />}
                            {t.l3 && <Field label={`${prefix} L3`} value={t.l3} />}
                            {t.node && <Field label={`${prefix} Node`} value={t.node} />}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
