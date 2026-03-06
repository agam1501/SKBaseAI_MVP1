"use client";

import ProposalCard from "@/components/ProposalCard";
import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Ticket = { ticket_id: string; short_desc: string; long_desc?: string | null; full_desc?: string | null; is_resolved: boolean };
type Proposal = { id: string; proposal_narrative?: string; narrative?: string; is_latest: boolean };

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient } = useClientContext();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const p = await apiClient.get<Proposal>(`/api/v1/proposals/tickets/${id}/latest`, token);
        setProposal(p);
      } catch {
        // no proposal yet — that's fine
      }
    });
  }, [id, supabase, selectedClient, router]);

  if (!selectedClient) return <div className="p-8 text-sm text-muted-foreground">Select a client first.</div>;
  if (!ticket) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="link" className="text-muted-foreground p-0 h-auto" asChild>
          <Link href="/tickets">← Back</Link>
        </Button>

        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold">{ticket.short_desc}</h1>
          </CardHeader>
          <CardContent className="space-y-2">
            {(ticket.full_desc ?? ticket.long_desc) && (
              <p className="text-sm text-muted-foreground">{ticket.full_desc ?? ticket.long_desc}</p>
            )}
            <span className="text-xs text-muted-foreground">{ticket.is_resolved ? "Resolved" : "Open"}</span>
          </CardContent>
        </Card>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {proposal ? (
          <ProposalCard
            proposal={{
              proposal_id: proposal.id,
              narrative: proposal.proposal_narrative ?? proposal.narrative ?? "",
              is_latest: proposal.is_latest,
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No proposal generated yet.</p>
        )}
      </div>
    </div>
  );
}
