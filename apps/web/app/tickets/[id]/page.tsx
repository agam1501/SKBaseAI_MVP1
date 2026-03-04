"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import ProposalCard from "@/components/ProposalCard";

type Ticket = { ticket_id: string; short_desc: string; long_desc: string | null; is_resolved: boolean };
type Proposal = { proposal_id: string; narrative: string; is_latest: boolean };

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<Ticket>(`/api/v1/tickets/${id}`).then(setTicket).catch((e: Error) => setError(e.message));
    apiClient.get<Proposal>(`/api/v1/proposals/tickets/${id}/latest`).then(setProposal).catch(() => {
      // no proposal yet — that's fine
    });
  }, [id]);

  if (!ticket) return <div className="p-8 text-sm text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <a href="/tickets" className="text-sm underline text-gray-500">← Back</a>

        <div className="bg-white rounded-xl shadow p-6 space-y-2">
          <h1 className="text-xl font-bold">{ticket.short_desc}</h1>
          {ticket.long_desc && <p className="text-sm text-gray-600">{ticket.long_desc}</p>}
          <span className="text-xs text-gray-400">{ticket.is_resolved ? "Resolved" : "Open"}</span>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {proposal ? (
          <ProposalCard proposal={proposal} />
        ) : (
          <p className="text-sm text-gray-400">No proposal generated yet.</p>
        )}
      </div>
    </div>
  );
}
