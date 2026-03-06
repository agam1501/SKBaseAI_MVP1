"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const EMPTY_CLIENT_VALUE = "__none__";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
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
  }, [supabase, loadClients, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleClientChange(value: string) {
    if (value === EMPTY_CLIENT_VALUE) {
      setSelectedClient(null);
    } else {
      const client = clients.find((c) => c.client_id === value) ?? null;
      setSelectedClient(client);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">Home</h1>
            {loading ? (
              <span className="text-sm text-muted-foreground block">Loading clients…</span>
            ) : (
              <Select
                value={selectedClient?.client_id ?? EMPTY_CLIENT_VALUE}
                onValueChange={handleClientChange}
              >
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_CLIENT_VALUE}>Select client…</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button variant="link" onClick={signOut} className="text-sm p-0 h-auto">
              Sign out
            </Button>
          </div>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {selectedClient ? (
          <div className="mt-10">
            <Link href="/tickets" className="block">
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardContent className="p-6">
                  <h2 className="font-semibold">Tickets for {selectedClient.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    View and manage support tickets
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a client from the dropdown above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
