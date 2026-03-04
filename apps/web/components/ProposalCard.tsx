"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";

type Proposal = { proposal_id: string; narrative: string; is_latest: boolean };

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submitFeedback(accepted: boolean) {
    setLoading(true);
    await apiClient.post(`/api/v1/proposals/${proposal.proposal_id}/feedback`, { accepted });
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl shadow p-6 space-y-4">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-400">AI Proposal</h2>
      <p className="text-sm leading-relaxed">{proposal.narrative}</p>

      {!submitted ? (
        <div className="flex gap-2">
          <button
            onClick={() => submitFeedback(true)}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => submitFeedback(false)}
            disabled={loading}
            className="px-4 py-2 border text-sm rounded disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Feedback submitted.</p>
      )}
    </div>
  );
}
