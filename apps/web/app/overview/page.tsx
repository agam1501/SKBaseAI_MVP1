"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type CrossTabMatrix } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function OverviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient, loadClients } = useClientContext();

  const [matrix, setMatrix] = useState<CrossTabMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState("");

  // Auth + client bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.push("/login");
      await loadClients(data.session.access_token);
    });
  }, [supabase, router, loadClients]);

  // Fetch cross-tab whenever selected client changes
  useEffect(() => {
    if (!selectedClient) return;

    let cancelled = false;

    async function fetchCrossTab() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !selectedClient) return;

      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.get<CrossTabMatrix>(
          "/api/v1/analytics/cross-tab/business-application",
          token,
          { clientId: selectedClient.client_id },
        );
        if (!cancelled) setMatrix(result ?? null);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCrossTab();
    return () => {
      cancelled = true;
    };
  }, [selectedClient, supabase]);

  // Pivot logic
  const {
    businessL1s,
    applicationL1s,
    cellMap,
    rowTotals,
    colTotals,
    grandTotal,
  } = useMemo(() => {
    const bizList = matrix?.business_l1s ?? [];
    const allAppList = matrix?.application_l1s ?? [];
    const map = new Map<string, number>();

    for (const row of matrix?.counts ?? []) {
      map.set(`${row.business_l1}||${row.application_l1}`, row.count);
    }

    const query = appFilter.trim().toLowerCase();
    const appList = query
      ? allAppList.filter((a) => a.toLowerCase().includes(query))
      : allAppList;

    const rowTotals = new Map<string, number>();
    for (const biz of bizList) {
      rowTotals.set(
        biz,
        appList.reduce((sum, app) => sum + (map.get(`${biz}||${app}`) ?? 0), 0),
      );
    }

    const colTotals = new Map<string, number>();
    for (const app of appList) {
      colTotals.set(
        app,
        bizList.reduce((sum, biz) => sum + (map.get(`${biz}||${app}`) ?? 0), 0),
      );
    }

    const grandTotal = bizList.reduce(
      (sum, biz) => sum + (rowTotals.get(biz) ?? 0),
      0,
    );

    return {
      businessL1s: bizList,
      applicationL1s: appList,
      cellMap: map,
      rowTotals,
      colTotals,
      grandTotal,
    };
  }, [matrix, appFilter]);

  const hasData =
    matrix !== null &&
    (matrix.business_l1s.length > 0 || matrix.application_l1s.length > 0);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ticket counts by Business Category × Application.
          </p>
        </div>

        {!selectedClient && (
          <p className="text-sm text-muted-foreground">
            Select a client to see the matrix.
          </p>
        )}

        {selectedClient && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold">
                    Business L1 × Application L1
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Client:{" "}
                    <span className="font-medium">{selectedClient.name}</span>
                  </p>
                </div>
                {hasData && (
                  <Input
                    placeholder="Filter applications…"
                    value={appFilter}
                    onChange={(e) => setAppFilter(e.target.value)}
                    className="w-64 h-8 text-sm"
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!loading && !error && !hasData && (
                <p className="text-sm text-muted-foreground">
                  No data available for this client.
                </p>
              )}
              {!loading && !error && hasData && (
                <div className="overflow-x-auto">
                  <div className="overflow-y-auto max-h-[480px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="sticky top-0 bg-background z-10">
                          <TableHead className="font-semibold sticky left-0 bg-background" />
                          {businessL1s.map((biz) => (
                            <TableHead
                              key={biz}
                              title={biz}
                              className="font-semibold min-w-[90px] max-w-[130px] whitespace-normal break-words leading-tight text-xs"
                            >
                              {biz}
                            </TableHead>
                          ))}
                          <TableHead className="font-semibold text-right border-l border-border">
                            Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {applicationL1s.map((app) => (
                          <TableRow key={app}>
                            <TableCell className="font-semibold sticky left-0 bg-background">
                              {app}
                            </TableCell>
                            {businessL1s.map((biz) => {
                              const count = cellMap.get(`${biz}||${app}`) ?? 0;
                              return (
                                <TableCell
                                  key={biz}
                                  className={
                                    count > 0
                                      ? "bg-blue-50 dark:bg-blue-950 font-medium text-sm"
                                      : "text-muted-foreground text-xs"
                                  }
                                >
                                  {count}
                                </TableCell>
                              );
                            })}
                            <TableCell className="font-semibold text-right border-l border-border">
                              {colTotals.get(app) ?? 0}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 bg-muted/40 font-semibold sticky bottom-0 z-10">
                          <TableCell className="sticky left-0 bg-muted/40 font-semibold">
                            Total
                          </TableCell>
                          {businessL1s.map((biz) => (
                            <TableCell key={biz} className="font-semibold">
                              {rowTotals.get(biz) ?? 0}
                            </TableCell>
                          ))}
                          <TableCell className="font-semibold text-right border-l border-border">
                            {grandTotal}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
