"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReactNode } from "react";
import type {
  Ticket,
  Taxonomy,
  TaxonomyBusinessCategory,
  TaxonomyApplication,
  TaxonomyResolution,
  TaxonomyRootCause,
} from "@/lib/types";

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

const TAXONOMY_ORDER = [
  "business_category",
  "application",
  "root_cause",
  "resolution",
];

const TAXONOMY_REF_PATH: Record<string, string> = {
  business_category: "business-category",
  application: "application",
  root_cause: "root-cause",
  resolution: "resolution",
};

type RefOption = { l1: string; l2: string; l3: string; node: string };

function normalizeRefData(type: string, data: unknown[]): RefOption[] {
  switch (type) {
    case "business_category":
      return (data as TaxonomyBusinessCategory[]).map((r) => ({
        l1: r.l1,
        l2: r.l2,
        l3: r.l3,
        node: r.node,
      }));
    case "application":
      return (data as TaxonomyApplication[]).map((r) => ({
        l1: r.l1,
        l2: r.l2,
        l3: r.l3,
        node: r.node_id,
      }));
    case "root_cause":
      return (data as TaxonomyRootCause[]).map((r) => ({
        l1: r.l1_cause_domain,
        l2: r.l2_cause_type,
        l3: r.l3_root_cause,
        node: r.root_cause_code_id,
      }));
    case "resolution":
      return (data as TaxonomyResolution[]).map((r) => ({
        l1: r.l1_outcome,
        l2: r.l2_action_type,
        l3: r.l3_resolution_code,
        node: r.resolution_code,
      }));
    default:
      return [];
  }
}

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

  // Taxonomy edit state
  const [editingType, setEditingType] = useState<string | null>(null);
  const [refData, setRefData] = useState<RefOption[]>([]);
  const [draftL1, setDraftL1] = useState("");
  const [draftL2, setDraftL2] = useState("");
  const [draftL3, setDraftL3] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        console.error("[taxonomy fetch]", msg, {
          ticketId: id,
          clientId: selectedClient.client_id,
        });
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

  async function startEditing(type: string, existing: Taxonomy | undefined) {
    setEditingType(type);
    setDraftL1(existing?.l1 ?? "");
    setDraftL2(existing?.l2 ?? "");
    setDraftL3(existing?.l3 ?? "");
    setSaveError(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const path = TAXONOMY_REF_PATH[type];
      const raw = await apiClient.get<unknown[]>(
        `/api/v1/taxonomies/${path}`,
        token,
        { clientId: selectedClient?.client_id },
      );
      setRefData(normalizeRefData(type, raw));
    } catch {
      setSaveError("Failed to load reference data");
      setRefData([]);
    }
  }

  function cancelEditing() {
    setEditingType(null);
    setRefData([]);
    setDraftL1("");
    setDraftL2("");
    setDraftL3("");
    setSaveError(null);
  }

  async function handleSaveTaxonomy(type: string) {
    if (!selectedClient) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const match = refData.find(
      (r) => r.l1 === draftL1 && r.l2 === draftL2 && r.l3 === draftL3,
    );
    setSaving(true);
    setSaveError(null);
    try {
      const created = await apiClient.post<Taxonomy>(
        `/api/v1/taxonomies/tickets/${id}/${type}`,
        token,
        {
          l1: draftL1 || null,
          l2: draftL2 || null,
          l3: draftL3 || null,
          node: match?.node ?? null,
        },
        { clientId: selectedClient.client_id },
      );
      setTaxonomies((prev) => [
        ...prev.filter((t) => t.taxonomy_type !== type),
        created,
      ]);
      cancelEditing();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save taxonomy");
    } finally {
      setSaving(false);
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{ticket.short_desc}</h1>
              {ticket.is_test && (
                <Badge
                  variant="outline"
                  className="text-xs border-amber-400 text-amber-600"
                >
                  TEST
                </Badge>
              )}
            </div>
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
            <div className="space-y-6">
              {TAXONOMY_ORDER.map((type) => {
                const existing = taxonomies.find(
                  (t) => t.taxonomy_type === type,
                );
                const isEditing = editingType === type;
                const prefix = TAXONOMY_FIELD_PREFIX[type] ?? type;

                const l1Options = [...new Set(refData.map((r) => r.l1))].sort();
                const l2Options = draftL1
                  ? [
                      ...new Set(
                        refData
                          .filter((r) => r.l1 === draftL1)
                          .map((r) => r.l2),
                      ),
                    ].sort()
                  : [];
                const l3Options =
                  draftL1 && draftL2
                    ? [
                        ...new Set(
                          refData
                            .filter((r) => r.l1 === draftL1 && r.l2 === draftL2)
                            .map((r) => r.l3),
                        ),
                      ].sort()
                    : [];

                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        {TAXONOMY_LABELS[type] ?? type}
                      </p>
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => startEditing(type, existing)}
                        >
                          Edit
                        </Button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {prefix} L1
                          </p>
                          <Select
                            value={draftL1}
                            onValueChange={(v) => {
                              setDraftL1(v);
                              setDraftL2("");
                              setDraftL3("");
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select L1…" />
                            </SelectTrigger>
                            <SelectContent>
                              {l1Options.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {prefix} L2
                          </p>
                          <Select
                            value={draftL2}
                            onValueChange={(v) => {
                              setDraftL2(v);
                              setDraftL3("");
                            }}
                            disabled={!draftL1}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue
                                placeholder={
                                  draftL1 ? "Select L2…" : "Select L1 first"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {l2Options.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {prefix} L3
                          </p>
                          <Select
                            value={draftL3}
                            onValueChange={setDraftL3}
                            disabled={!draftL2}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue
                                placeholder={
                                  draftL2 ? "Select L3…" : "Select L2 first"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {l3Options.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {saveError && (
                          <p className="text-xs text-destructive">
                            {saveError}
                          </p>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveTaxonomy(type)}
                            disabled={!draftL1 || saving}
                          >
                            {saving ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : existing ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {existing.l1 && (
                          <Field label={`${prefix} L1`} value={existing.l1} />
                        )}
                        {existing.l2 && (
                          <Field label={`${prefix} L2`} value={existing.l2} />
                        )}
                        {existing.l3 && (
                          <Field label={`${prefix} L3`} value={existing.l3} />
                        )}
                        {existing.node && (
                          <Field
                            label={`${prefix} Node`}
                            value={existing.node}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Not assigned yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
