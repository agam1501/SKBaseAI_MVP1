"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type TicketUploadResult } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Back
          </Link>
        </div>

        {(clientsError || error) && (
          <p className="text-red-600 text-sm">{clientsError ?? error}</p>
        )}

        {!selectedClient && (
          <p className="text-gray-500 text-sm">Select a client on the dashboard to upload tickets.</p>
        )}

        {selectedClient && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 space-y-6 w-full max-w-sm">
              <h2 className="text-center text-sm font-semibold text-gray-700">Upload tickets (CSV)</h2>
              <div className="flex flex-col items-center gap-4 w-full">
                <label className="flex flex-col items-center gap-2 w-full cursor-pointer">
                  <span className="text-sm text-gray-600">
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
                  <span className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">
                    Choose file
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!uploadFile || uploading}
                  onClick={handleUpload}
                  className="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
              {uploadResult && (
                <div className="text-sm space-y-1 text-center">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
