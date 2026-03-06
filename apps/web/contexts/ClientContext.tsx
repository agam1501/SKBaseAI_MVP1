"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "@/lib/api-client";

export type Client = { client_id: string; name: string };

const STORAGE_KEY = "skbaseai_selected_client_id";

type ClientContextValue = {
  clients: Client[];
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  loadClients: (token: string) => Promise<void>;
  loading: boolean;
  error: string | null;
};

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClientState] = useState<Client | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSelectedClient = useCallback((client: Client | null) => {
    setSelectedClientState(client);
    if (client) {
      localStorage.setItem(STORAGE_KEY, client.client_id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const loadClients = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    const timeoutMs = 15000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Request timed out. Check that the API is running and NEXT_PUBLIC_API_URL is set.",
            ),
          ),
        timeoutMs,
      ),
    );
    try {
      const data = await Promise.race([
        apiClient.get<Client[]>("/api/v1/clients", token),
        timeoutPromise,
      ]);
      setClients(data ?? []);
      const storedId = localStorage.getItem(STORAGE_KEY);
      const matched = (data ?? []).find((c) => c.client_id === storedId);
      if (matched) {
        setSelectedClientState(matched);
      } else if ((data ?? []).length > 0) {
        const first = (data ?? [])[0];
        setSelectedClientState(first);
        localStorage.setItem(STORAGE_KEY, first.client_id);
      } else {
        setSelectedClientState(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
      setClients([]);
      setSelectedClientState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <ClientContext.Provider
      value={{
        clients,
        selectedClient,
        setSelectedClient,
        loadClients,
        loading,
        error,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext() {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error("useClientContext must be used within ClientProvider");
  }
  return ctx;
}
