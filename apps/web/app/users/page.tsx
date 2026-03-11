"use client";

import { useClientContext } from "@/contexts/ClientContext";
import { apiClient, type UserRead } from "@/lib/api-client";
import { createClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { UserRole } from "@/lib/types";
const ALLOWED_ROLES: UserRole["role"][] = ["Admin", "Developer"];

const INVITE_ROLES_BY_ROLE: Record<string, UserRole["role"][]> = {
  Admin: ["Responder"],
  Developer: ["Admin", "Responder"],
};

export default function UsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedClient, loadClients } = useClientContext();

  const [role, setRole] = useState<UserRole["role"] | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const inviteRoleOptions = role ? (INVITE_ROLES_BY_ROLE[role] ?? []) : [];

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole["role"]>("Responder");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

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
    if (!role || !selectedClient) return;

    async function fetchUsers() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !selectedClient) return;
      setLoadingUsers(true);
      try {
        const list = await apiClient.get<UserRead[]>("/api/v1/users", token, {
          clientId: selectedClient.client_id,
        });
        setUsers(list);
      } catch {
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    }

    fetchUsers();
  }, [role, selectedClient, supabase]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSuccess(null);
    setInviteError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !selectedClient) return;

    setInviting(true);
    try {
      const created = await apiClient.post<UserRead>(
        "/api/v1/users/invite",
        token,
        { email: inviteEmail, role: inviteRole },
        { clientId: selectedClient.client_id },
      );
      setInviteSuccess(`Invite sent to ${created.email}.`);
      setInviteEmail("");
      setUsers((prev) => [created, ...prev]);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setInviting(false);
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
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and invite users for the selected client.
          </p>
        </div>

        {!selectedClient && (
          <p className="text-sm text-muted-foreground">
            Select a client to manage its users.
          </p>
        )}

        {selectedClient && (
          <>
            {/* Invite card */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Invite User</h2>
                <p className="text-sm text-muted-foreground">
                  For <span className="font-medium">{selectedClient.name}</span>
                </p>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleInvite}
                  className="flex gap-3 items-end flex-wrap"
                >
                  <div className="flex-1 min-w-48 space-y-1">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Role</label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) =>
                        setInviteRole(v as UserRole["role"])
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteRoleOptions.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? "Sending…" : "Send Invite"}
                  </Button>
                </form>
                {inviteSuccess && (
                  <p className="text-sm text-green-700 mt-3">{inviteSuccess}</p>
                )}
                {inviteError && (
                  <p className="text-sm text-destructive mt-3">{inviteError}</p>
                )}
              </CardContent>
            </Card>

            {/* Users table */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Invited Users</h2>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No users invited yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Invited</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.user_id}>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{u.role}</TableCell>
                          <TableCell>
                            {new Date(u.invited_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
