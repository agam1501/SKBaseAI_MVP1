"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedClient, loadClients, error } = useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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
  }, [loadClients, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Home</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <a href="/clients" className="text-sm underline text-gray-600">
              Select client
            </a>
            <span className="text-sm text-gray-500">{email}</span>
            <button onClick={signOut} className="text-sm underline">
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {selectedClient ? (
          <div className="grid grid-cols-2 gap-4">
            <a
              href="/tickets"
              className="p-6 bg-white rounded-xl shadow hover:shadow-md transition"
            >
              <h2 className="font-semibold">Tickets</h2>
              <p className="text-sm text-gray-500 mt-1">View and manage support tickets</p>
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            <a href="/clients" className="underline">Select a client</a> to get started.
          </p>
        )}
      </div>
    </div>
  );
}
