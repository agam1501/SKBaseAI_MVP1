"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import type { MonthlyTicketStat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function defaultStartMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultEndMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type TooltipPayloadItem = {
  name: string;
  value: number | null;
  color: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const opened = payload.find((p) => p.name === "Opened")?.value ?? 0;
  const closed = payload.find((p) => p.name === "Closed")?.value ?? 0;
  const mttr = payload.find((p) => p.name === "Avg MTTR (hrs)")?.value ?? null;

  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      <p className="text-indigo-600">
        <span className="font-medium">Opened:</span> {opened}
      </p>
      <p className="text-emerald-600">
        <span className="font-medium">Closed:</span> {closed}
      </p>
      <p className="text-amber-500">
        <span className="font-medium">Avg MTTR:</span>{" "}
        {mttr != null ? `${Number(mttr).toFixed(1)}h` : "N/A"}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient } = useClientContext();

  const [startMonth, setStartMonth] = useState(defaultStartMonth());
  const [endMonth, setEndMonth] = useState(defaultEndMonth());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState<MonthlyTicketStat[] | null>(null);

  async function handleApply() {
    if (!selectedClient) {
      setValidationError("Select a company from the top bar first.");
      return;
    }
    if (startMonth > endMonth) {
      setValidationError("Start month must be on or before end month.");
      return;
    }
    setValidationError(null);
    setFetchError(null);
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setFetchError("Not authenticated.");
        return;
      }

      const result = await apiClient.get<{ stats: MonthlyTicketStat[] }>(
        `/api/v1/analytics/tickets/monthly-stats?start_month=${startMonth}&end_month=${endMonth}`,
        token,
        { clientId: selectedClient.client_id },
      );
      setStats(result.stats);
    } catch (e: unknown) {
      setFetchError(
        e instanceof Error ? e.message : "Failed to load analytics.",
      );
    } finally {
      setLoading(false);
    }
  }

  const hasData = stats && stats.length > 0;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ticket volume and resolution trends by company
          </p>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="start-month">Start month</Label>
                <Input
                  id="start-month"
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-month">End month</Label>
                <Input
                  id="end-month"
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                />
              </div>

              <Button onClick={handleApply} disabled={loading}>
                {loading ? "Loading…" : "Apply"}
              </Button>
            </div>

            {validationError && (
              <p className="mt-3 text-sm text-destructive">{validationError}</p>
            )}
            {fetchError && (
              <p className="mt-3 text-sm text-destructive">{fetchError}</p>
            )}
          </CardContent>
        </Card>

        {/* Chart */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">
              Tickets opened vs. closed &amp; Avg MTTR
            </h2>
          </CardHeader>
          <CardContent>
            {!hasData && !loading && (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                {stats
                  ? "No data for this range."
                  : "Select a company from the top bar, set a date range, then click Apply."}
              </div>
            )}

            {hasData && (
              <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={400} minWidth={Math.max(stats.length * 80, 500)}>
                <ComposedChart
                  data={stats}
                  margin={{ top: 8, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                  />
                  <YAxis
                    yAxisId="tickets"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: "Tickets",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fontSize: 11, fill: "#9ca3af" },
                    }}
                  />
                  <YAxis
                    yAxisId="mttr"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={false}
                    unit="h"
                    label={{
                      value: "MTTR (hrs)",
                      angle: 90,
                      position: "insideRight",
                      offset: 10,
                      style: { fontSize: 11, fill: "#9ca3af" },
                    }}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "#f3f4f6" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 13, paddingTop: 16 }}
                    iconType="circle"
                  />
                  <Bar
                    yAxisId="tickets"
                    dataKey="opened"
                    name="Opened"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    yAxisId="tickets"
                    dataKey="closed"
                    name="Closed"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    yAxisId="mttr"
                    dataKey="avg_mttr_hours"
                    name="Avg MTTR (hrs)"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
