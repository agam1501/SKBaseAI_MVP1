"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type TicketUploadResult } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { UserRole } from "@/lib/types";

const ALLOWED_ROLES: UserRole["role"][] = ["Admin", "Developer"];

export default function IngestionPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient, loadClients } = useClientContext();

  const [role, setRole] = useState<UserRole["role"] | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isTest, setIsTest] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<TicketUploadResult | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.push("/login");
      const token = data.session.access_token;

      await loadClients(token);

      try {
        const me = await apiClient.get<UserRole>("/api/v1/me/role", token);
        if (!ALLOWED_ROLES.includes(me.role)) {
          router.replace("/dashboard");
          return;
        }
        setRole(me.role);
      } catch {
        setRoleError("You don't have permission to access this page.");
      }
    });
  }, [supabase, router, loadClients]);

  useEffect(() => {
    setUploadResult(null);
    setUploadError(null);
  }, [selectedClient?.client_id]);

  async function handleUpload() {
    if (!selectedClient || !uploadFile) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const uploadPath = isTest
        ? "/api/v1/tickets/upload?is_test=true"
        : "/api/v1/tickets/upload";
      const result = await apiClient.uploadTickets(
        uploadPath,
        token,
        uploadFile,
        { clientId: selectedClient.client_id },
      );
      setUploadResult(result);
      setUploadFile(null);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (roleError) {
    return <div className="p-8 text-sm text-destructive">{roleError}</div>;
  }

  if (!role) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Ingestion</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload ticket data for the selected client.
          </p>
        </div>

        {!selectedClient && (
          <p className="text-sm text-muted-foreground">
            Select a client on the dashboard first.
          </p>
        )}

        {selectedClient && (
          <>
            {/* Upload card */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Upload Tickets (CSV)</h2>
                <p className="text-sm text-muted-foreground">
                  For <span className="font-medium">{selectedClient.name}</span>
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex flex-col gap-2 cursor-pointer">
                  <span className="text-sm text-muted-foreground">
                    {uploadFile ? uploadFile.name : "No file chosen"}
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      setUploadFile(e.target.files?.[0] ?? null);
                      setUploadResult(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    asChild
                    className="w-fit"
                  >
                    <span>Choose file</span>
                  </Button>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTest}
                    onChange={(e) => setIsTest(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-muted-foreground">
                    Mark as test data
                  </span>
                </label>
                {isTest && (
                  <p className="text-xs text-muted-foreground">
                    These tickets will be marked as test data and can be
                    filtered out on the dashboard.
                  </p>
                )}

                <Button
                  type="button"
                  disabled={!uploadFile || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? "Uploading…" : "Upload"}
                </Button>

                {uploadError && (
                  <p className="text-sm text-destructive">{uploadError}</p>
                )}

                {uploadResult && (
                  <div className="text-sm space-y-1">
                    {uploadResult.created > 0 && (
                      <p className="text-green-700 font-medium">
                        Created {uploadResult.created} ticket
                        {uploadResult.created !== 1 ? "s" : ""}.
                      </p>
                    )}
                    {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                      <div>
                        <p className="text-amber-700 font-medium">Warnings:</p>
                        <ul className="list-disc list-inside text-amber-800 mt-0.5">
                          {uploadResult.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {uploadResult.errors.length > 0 && (
                      <div>
                        <p className="text-amber-700 font-medium">
                          Row errors:
                        </p>
                        <ul className="list-disc list-inside text-amber-800 mt-0.5">
                          {uploadResult.errors.map((err, i) => (
                            <li key={i}>
                              Row {err.row}: {err.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* History placeholder */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Ingestion History</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Run-level ingestion history will appear here once job tracking
                  is enabled.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
