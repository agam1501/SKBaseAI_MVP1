"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/types";

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submitFeedback(accepted: boolean) {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    await apiClient.post(
      `/api/v1/proposals/${proposal.proposal_id}/feedback`,
      token,
      { accepted },
    );
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          AI Proposal
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{proposal.narrative}</p>

        {!submitted ? (
          <div className="flex gap-2">
            <Button
              onClick={() => submitFeedback(true)}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              Accept
            </Button>
            <Button
              variant="outline"
              onClick={() => submitFeedback(false)}
              disabled={loading}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Feedback submitted.</p>
        )}
      </CardContent>
    </Card>
  );
}
