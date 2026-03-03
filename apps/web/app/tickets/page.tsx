"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { apiClient } from "@/lib/api-client";

type Ticket = {
  ticket_id: string;
  short_desc: string;
  is_resolved: boolean;
  created_at: string;
};

export default function TicketsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return router.push("/login");

      try {
        const data = await apiClient.get<Ticket[]>("/api/v1/tickets", token);
        setTickets(data);
      } catch (e: any) {
        setError(e.message);
      }
    });
  }, []);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Tickets</h1>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {tickets.length === 0 && !error && (
          <p className="text-gray-500 text-sm">No tickets yet.</p>
        )}

        {tickets.map((t) => (
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
