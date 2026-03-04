"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();
  const [email, setEmail] = useState<string | null>(null);

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
  }, [loadClients]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4 flex-wrap">
            {loading ? (
              <span className="text-sm text-gray-500">Loading clients…</span>
            ) : (
              <>
                <label className="text-sm text-gray-600 font-medium">
                  Client:
                  <select
                    className="ml-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                    value={selectedClient?.client_id ?? ""}
                    onChange={(e) => {
                      const c = clients.find((c) => c.client_id === e.target.value);
                      setSelectedClient(c ?? null);
                    }}
                  >
                    {clients.map((c) => (
                      <option key={c.client_id} value={c.client_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <span className="text-sm text-gray-500">{email}</span>
            <button onClick={signOut} className="text-sm underline">
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {selectedClient && (
          <div className="grid grid-cols-2 gap-4">
            <a
              href="/tickets"
              className="p-6 bg-white rounded-xl shadow hover:shadow-md transition"
            >
              <h2 className="font-semibold">Tickets</h2>
              <p className="text-sm text-gray-500 mt-1">View and manage support tickets</p>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
