"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListFilter,
  ChevronLeft,
  X,
} from "lucide-react";

const EMPTY_CLIENT_VALUE = "__none__";

type Ticket = {
  ticket_id: string;
  external_id: string | null;
  short_desc: string;
  status: string | null;
  priority: string | null;
  is_resolved: boolean;
  created_at: string;
};

type SortColumn = "external_id" | "short_desc" | "status" | "created_at";
type SortDirection = "asc" | "desc";

type FilterColumn =
  | "external_id"
  | "short_desc"
  | "status"
  | "priority"
  | "is_resolved";
type FilterOperator = "contains" | "does_not_contain" | "is" | "is_not";
type Filter = {
  id: string;
  column: FilterColumn;
  operator: FilterOperator;
  value: string;
};

const FILTER_COLUMNS: Record<
  FilterColumn,
  {
    label: string;
    type: "text" | "enum" | "boolean";
    operators: FilterOperator[];
    options: string[] | null;
  }
> = {
  external_id: {
    label: "External ID",
    type: "text",
    operators: ["contains", "does_not_contain", "is", "is_not"],
    options: null,
  },
  short_desc: {
    label: "Summary",
    type: "text",
    operators: ["contains", "does_not_contain", "is", "is_not"],
    options: null,
  },
  status: {
    label: "Status",
    type: "enum",
    operators: ["is", "is_not"],
    options: ["OPEN", "CLOSED"],
  },
  priority: {
    label: "Priority",
    type: "text",
    operators: ["contains", "does_not_contain", "is", "is_not"],
    options: null,
  },
  is_resolved: {
    label: "Resolved",
    type: "boolean",
    operators: ["is"],
    options: ["Yes", "No"],
  },
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  does_not_contain: "does not contain",
  is: "is",
  is_not: "is not",
};

function FilterPopoverContent({
  onAdd,
  onClose,
}: {
  onAdd: (f: Filter) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedColumn, setSelectedColumn] = useState<FilterColumn | null>(
    null,
  );
  const [selectedOperator, setSelectedOperator] =
    useState<FilterOperator | null>(null);
  const [value, setValue] = useState("");

  function handleColumnSelect(col: FilterColumn) {
    setSelectedColumn(col);
    const config = FILTER_COLUMNS[col];
    if (config.operators.length === 1) {
      setSelectedOperator(config.operators[0]);
      setStep(3);
    } else {
      setStep(2);
    }
  }

  function handleOperatorSelect(op: FilterOperator) {
    setSelectedOperator(op);
    setStep(3);
  }

  function handleSubmit(val?: string) {
    const finalValue = val ?? value;
    if (!selectedColumn || !selectedOperator || !finalValue.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      column: selectedColumn,
      operator: selectedOperator,
      value: finalValue,
    });
    onClose();
  }

  function goBack() {
    if (step === 3) {
      const config = selectedColumn ? FILTER_COLUMNS[selectedColumn] : null;
      if (config && config.operators.length === 1) {
        setSelectedColumn(null);
        setSelectedOperator(null);
        setStep(1);
      } else {
        setSelectedOperator(null);
        setValue("");
        setStep(2);
      }
    } else if (step === 2) {
      setSelectedColumn(null);
      setStep(1);
    }
  }

  if (step === 1) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">
          Filter by…
        </p>
        {(
          Object.entries(FILTER_COLUMNS) as [
            FilterColumn,
            (typeof FILTER_COLUMNS)[FilterColumn],
          ][]
        ).map(([key, config]) => (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm font-normal"
            onClick={() => handleColumnSelect(key)}
          >
            {config.label}
          </Button>
        ))}
      </div>
    );
  }

  if (step === 2 && selectedColumn) {
    const config = FILTER_COLUMNS[selectedColumn];
    return (
      <div className="space-y-1">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
        >
          <ChevronLeft className="h-3 w-3" />
          {config.label}
        </button>
        {config.operators.map((op) => (
          <Button
            key={op}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm font-normal"
            onClick={() => handleOperatorSelect(op)}
          >
            {OPERATOR_LABELS[op]}
          </Button>
        ))}
      </div>
    );
  }

  if (step === 3 && selectedColumn && selectedOperator) {
    const config = FILTER_COLUMNS[selectedColumn];
    return (
      <div className="space-y-2">
        <button
          onClick={goBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1"
        >
          <ChevronLeft className="h-3 w-3" />
          {config.label} {OPERATOR_LABELS[selectedOperator]}
        </button>
        {config.options ? (
          <div className="space-y-1">
            {config.options.map((opt) => (
              <Button
                key={opt}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm font-normal"
                onClick={() => handleSubmit(opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 px-1">
            <Input
              autoFocus
              placeholder="Type a value…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!value.trim()}
              onClick={() => handleSubmit()}
            >
              Apply
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const {
    clients,
    selectedClient,
    setSelectedClient,
    loadClients,
    loading,
    error,
  } = useClientContext();
  const [email, setEmail] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  const loadTickets = useCallback(async () => {
    if (!selectedClient) {
      setTickets([]);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const data_ = await apiClient.get<Ticket[]>("/api/v1/tickets", token, {
        clientId: selectedClient.client_id,
      });
      setTickets(data_);
    } catch (e: unknown) {
      setTicketsError(
        e instanceof Error ? e.message : "Failed to load tickets",
      );
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, [selectedClient, supabase]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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

  function getTicketStatus(t: Ticket): string {
    return t.status ?? (t.is_resolved ? "CLOSED" : "OPEN");
  }

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "created_at" ? "desc" : "asc");
    }
  }

  function addFilter(filter: Filter) {
    setFilters((prev) => [...prev, filter]);
  }

  function removeFilter(id: string) {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAllFilters() {
    setFilters([]);
  }

  const filteredTickets = useMemo(() => {
    let result = tickets;

    for (const filter of filters) {
      result = result.filter((ticket) => {
        let fieldValue: string;
        if (filter.column === "is_resolved") {
          fieldValue = ticket.is_resolved ? "Yes" : "No";
        } else if (filter.column === "status") {
          fieldValue = getTicketStatus(ticket);
        } else {
          fieldValue = (ticket[filter.column] as string | null) ?? "";
        }

        const filterVal = filter.value;

        switch (filter.operator) {
          case "contains":
            return fieldValue.toLowerCase().includes(filterVal.toLowerCase());
          case "does_not_contain":
            return !fieldValue.toLowerCase().includes(filterVal.toLowerCase());
          case "is":
            return fieldValue.toLowerCase() === filterVal.toLowerCase();
          case "is_not":
            return fieldValue.toLowerCase() !== filterVal.toLowerCase();
          default:
            return true;
        }
      });
    }

    // Sort
    const dir = sortDirection === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortColumn) {
        case "external_id": {
          const aVal = a.external_id ?? "";
          const bVal = b.external_id ?? "";
          return dir * aVal.localeCompare(bVal);
        }
        case "short_desc":
          return dir * a.short_desc.localeCompare(b.short_desc);
        case "status": {
          const aStatus = getTicketStatus(a);
          const bStatus = getTicketStatus(b);
          return dir * aStatus.localeCompare(bStatus);
        }
        case "created_at":
          return (
            dir *
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime())
          );
        default:
          return 0;
      }
    });

    return result;
  }, [tickets, filters, sortColumn, sortDirection]);

  function SortIcon({ column }: { column: SortColumn }) {
    if (sortColumn !== column)
      return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-40" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="inline ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="inline ml-1 h-3 w-3" />
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">Home</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Button
              variant="link"
              onClick={signOut}
              className="text-sm p-0 h-auto"
            >
              Sign out
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="dashboard-client-select"
            className="text-sm font-medium text-muted-foreground"
          >
            Client
          </Label>
          {loading ? (
            <span className="text-sm text-muted-foreground block">
              Loading clients…
            </span>
          ) : (
            <Select
              value={selectedClient?.client_id ?? EMPTY_CLIENT_VALUE}
              onValueChange={handleClientChange}
            >
              <SelectTrigger
                id="dashboard-client-select"
                className="min-w-[160px] w-[160px]"
              >
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_CLIENT_VALUE}>
                  Select client…
                </SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.client_id} value={c.client_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {selectedClient ? (
          <div className="mt-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Tickets for {selectedClient.name}
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/taxonomies">Taxonomies</Link>
                </Button>
                <Button asChild>
                  <Link href="/upload_tickets">Upload</Link>
                </Button>
              </div>
            </div>
            {ticketsError && (
              <p className="text-destructive text-sm">{ticketsError}</p>
            )}

            {/* Power Search Filter Bar */}
            {!ticketsLoading && tickets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ListFilter className="h-4 w-4 mr-1" />
                      Add Filter
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-2" align="start">
                    <FilterPopoverContent
                      onAdd={addFilter}
                      onClose={() => setFilterOpen(false)}
                    />
                  </PopoverContent>
                </Popover>

                {filters.map((f) => (
                  <Badge key={f.id} variant="secondary" className="gap-1 pr-1">
                    <span className="text-xs">
                      {FILTER_COLUMNS[f.column].label}{" "}
                      {OPERATOR_LABELS[f.operator]}{" "}
                      <span className="font-semibold">{f.value}</span>
                    </span>
                    <button
                      onClick={() => removeFilter(f.id)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}

                {filters.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            )}

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                {ticketsLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading tickets…
                  </div>
                ) : ticketsError ? (
                  <div className="px-4 py-8 text-center text-sm text-destructive">
                    Could not load tickets: {ticketsError}
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No tickets yet.
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No tickets match your filters.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900"
                          onClick={() => toggleSort("external_id")}
                        >
                          External ID
                          <SortIcon column="external_id" />
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900"
                          onClick={() => toggleSort("short_desc")}
                        >
                          Summary
                          <SortIcon column="short_desc" />
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900"
                          onClick={() => toggleSort("status")}
                        >
                          Status
                          <SortIcon column="status" />
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900"
                          onClick={() => toggleSort("created_at")}
                        >
                          Priority
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                        >
                          Created
                          <SortIcon column="created_at" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredTickets.map((t) => (
                        <tr
                          key={t.ticket_id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/tickets/${t.ticket_id}`)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {t.external_id ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {t.short_desc}
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span
                              className={
                                t.is_resolved
                                  ? "text-gray-500"
                                  : "text-amber-600 font-medium"
                              }
                            >
                              {getTicketStatus(t)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {t.priority ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
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
