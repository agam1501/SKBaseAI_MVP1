"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login");
      } else {
        setEmail(data.user.email ?? null);
      }
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{email}</span>
            <button onClick={signOut} className="text-sm underline">
              Sign out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <a href="/tickets" className="p-6 bg-white rounded-xl shadow hover:shadow-md transition">
            <h2 className="font-semibold">Tickets</h2>
            <p className="text-sm text-gray-500 mt-1">View and manage support tickets</p>
          </a>
        </div>
      </div>
    </div>
  );
}
