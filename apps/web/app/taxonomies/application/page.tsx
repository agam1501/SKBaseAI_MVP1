"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { type TaxonomyApplication } from "@/app/taxonomies/types";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ApplicationTaxonomyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient, loadClients } = useClientContext();
  const [data, setData] = useState<TaxonomyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      router.push("/login");
      return;
    }
    await loadClients(session.session.access_token);
    const token = session.session.access_token;
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.get<TaxonomyApplication[]>(
        "/api/v1/taxonomies/application",
        token,
        { clientId: selectedClient?.client_id ?? undefined },
      );
      setData(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, router, loadClients, selectedClient?.client_id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Application</h2>
        <p className="text-sm text-muted-foreground">
          Applications, products, and vendors.
        </p>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive mb-4">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>L1</TableHead>
                <TableHead>L2</TableHead>
                <TableHead>L3</TableHead>
                <TableHead>Node ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    No rows
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.l1}</TableCell>
                    <TableCell>{row.l2}</TableCell>
                    <TableCell>{row.l3}</TableCell>
                    <TableCell>{row.node_id}</TableCell>
                    <TableCell>{row.label ?? "—"}</TableCell>
                    <TableCell>{row.software_vendor ?? "—"}</TableCell>
                    <TableCell>{row.product_name ?? "—"}</TableCell>
                    <TableCell>
                      {row.is_active != null
                        ? row.is_active
                          ? "Yes"
                          : "No"
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
