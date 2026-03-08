import type { Metadata } from "next";
import { ClientProvider } from "@/contexts/ClientContext";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKBaseAI",
  description: "AI-powered ticket resolution",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <ClientProvider>
          <AppShell>{children}</AppShell>
        </ClientProvider>
      </body>
    </html>
  );
}
