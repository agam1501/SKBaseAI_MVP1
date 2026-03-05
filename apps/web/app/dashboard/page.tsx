"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Select a client</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-gray-500">{email}</span>
            <button onClick={signOut} className="text-sm underline">
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Loading clients…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-600">Choose a client to view their tickets.</p>
              <Link
                href="/add_client"
                className="inline-flex items-center px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
              >
                Add client
              </Link>
            </div>

            {clients.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center">
                <p className="text-gray-500 mb-4">You don’t have any clients yet.</p>
                <Link
                  href="/add_client"
                  className="inline-flex items-center px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
                >
                  Add your first client
                </Link>
              </div>
            ) : (
              <div className="relative" ref={pickerRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Client
                </label>
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="w-full text-left rounded-xl border-2 border-gray-200 bg-white p-4 transition flex items-center justify-between hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                >
                  <span className="font-medium">
                    {selectedClient ? selectedClient.name : "Select a client…"}
                  </span>
                  <span className="text-gray-400">
                    <svg
                      className={`w-5 h-5 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {pickerOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg py-1 max-h-60 overflow-auto">
                    {clients.map((c) => (
                      <button
                        key={c.client_id}
                        type="button"
                        onClick={() => {
                          setSelectedClient(c);
                          setPickerOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-sm transition ${
                          selectedClient?.client_id === c.client_id
                            ? "bg-gray-100 font-medium"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedClient && (
              <div className="pt-4">
                <Link
                  href="/tickets"
                  className="block w-full text-center py-3 px-4 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition"
                >
                  View tickets for {selectedClient.name}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
