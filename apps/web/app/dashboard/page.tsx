"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { clients, selectedClient, setSelectedClient, loadClients, loading, error } =
    useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

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
            {loading ? (
              <span className="text-sm text-gray-500">Loading clients…</span>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center justify-between gap-2 min-w-[200px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate">
                    {selectedClient ? selectedClient.name : "Select client…"}
                  </span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {dropdownOpen && (
                  <ul
                    className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[200px] overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    role="listbox"
                  >
                    <li role="option">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(null);
                          setDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
                      >
                        Select client…
                      </button>
                    </li>
                    {clients.map((c) => (
                      <li key={c.client_id} role="option">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClient(c);
                            setDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                            selectedClient?.client_id === c.client_id
                              ? "bg-gray-50 font-medium text-gray-900"
                              : "text-gray-700"
                          }`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <span className="text-sm text-gray-500">{email}</span>
            <button onClick={signOut} className="text-sm underline">
              Sign out
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {selectedClient ? (
          <div className="mt-10">
            <a
              href="/tickets"
              className="block w-full p-6 bg-white rounded-xl shadow hover:shadow-md transition"
            >
              <h2 className="font-semibold">Tickets for {selectedClient.name}</h2>
              <p className="text-sm text-gray-500 mt-1">View and manage support tickets</p>
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Select a client from the dropdown above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
