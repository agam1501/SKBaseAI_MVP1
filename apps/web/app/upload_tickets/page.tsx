"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type TicketUploadResult } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function UploadTicketsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedClient, loadClients, error: clientsError } = useClientContext();
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<TicketUploadResult | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.push("/login");
      const token = data.session.access_token;
      if (!token) return;
      await loadClients(token);
    });
  }, [loadClients]);

  useEffect(() => {
    setUploadResult(null);
  }, [selectedClient?.client_id]);

  const handleUpload = async () => {
    if (!selectedClient || !uploadFile) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    setUploading(true);
    setUploadResult(null);
    setError(null);
    try {
      const result = await apiClient.uploadTickets(
        "/api/v1/tickets/upload",
        token,
        uploadFile,
        { clientId: selectedClient.client_id }
      );
      setUploadResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold">
            {selectedClient
              ? `Upload New Tickets for ${selectedClient.name}`
              : "Upload New Tickets"}
          </h1>
          <Button variant="link" asChild className="text-muted-foreground">
            <Link href="/dashboard">← Back</Link>
          </Button>
        </div>

        {(clientsError || error) && (
          <p className="text-destructive text-sm">{clientsError ?? error}</p>
        )}

        {!selectedClient && (
          <p className="text-muted-foreground text-sm">Select a client on the dashboard to upload tickets.</p>
        )}

        {selectedClient && (
          <div className="flex flex-col items-center justify-center py-12">
            <Card className="w-full max-w-sm">
              <CardHeader className="text-center pb-2">
                <h2 className="text-sm font-semibold leading-none tracking-tight">Upload tickets (CSV)</h2>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <label className="flex flex-col items-center gap-2 w-full cursor-pointer">
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
                  <Button type="button" variant="outline" asChild className="w-full max-w-[200px]">
                    <span>Choose file</span>
                  </Button>
                </label>
                <Button
                  type="button"
                  disabled={!uploadFile || uploading}
                  onClick={handleUpload}
                  className="w-full"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
                {uploadResult && (
                  <div className="text-sm space-y-1 text-center w-full">
                    {uploadResult.created > 0 && (
                      <p className="text-green-700 font-medium">
                        Created {uploadResult.created} ticket{uploadResult.created !== 1 ? "s" : ""}.
                      </p>
                    )}
                    {uploadResult.errors.length > 0 && (
                      <div className="text-left">
                        <p className="text-amber-700 font-medium">Row errors:</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
