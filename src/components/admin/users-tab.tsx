import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listUsers, createUser, deleteUser } from "@/lib/api/users.functions";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";

function generatePassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(14)))
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
}

export function UsersTab() {
  const qc = useQueryClient();
  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listUsers(),
  });

  function regenerate() {
    setPassword(generatePassword());
    setCopied(false);
  }

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!full_name.trim() || !email || !password) return;
    setBusy(true);
    try {
      await createUser({ data: { full_name: full_name.trim(), email, password, role, phone: phone.trim() || undefined } });
      toast.success(`Account created for ${full_name.trim()}. Share the temporary password with them.`);
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword(generatePassword());
      setCopied(false);
      setRole("user");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create user");
    } finally { setBusy(false); }
  }

  async function handleDelete(userId: string, userEmail: string) {
    if (confirmDelete !== userId) {
      setConfirmDelete(userId);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    setBusy(true);
    try {
      await deleteUser({ data: { userId } });
      toast.success(`Removed access for ${userEmail}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove user");
    } finally { setBusy(false); setConfirmDelete(null); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-display">Authorised users</h2>
        <p className="text-sm text-muted-foreground">
          Only accounts you create here can sign in. Self-registration is disabled. New users are prompted to set their own password on first sign-in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Create account
          </CardTitle>
          <CardDescription>
            A temporary password is generated automatically. Share it with the user — they will be required to change it when they first sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Full name *</Label>
                <Input
                  id="new-name"
                  required
                  maxLength={120}
                  value={full_name}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jane Banda"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-phone">Phone number</Label>
                <Input
                  id="new-phone"
                  type="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0977123456"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email address *</Label>
                <Input
                  id="new-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                    <SelectItem value="user">User — standard access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input
                  id="temp-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                  required
                  minLength={8}
                />
                <Button type="button" variant="outline" size="icon" onClick={copyPassword} title="Copy password">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={regenerate} title="Generate new password">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this before submitting — the user will need it to sign in for the first time.
              </p>
            </div>

            <Button type="submit" disabled={busy || !full_name.trim() || !email || !password}>
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-sm">Current users</h3>
        </div>
        {users.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading users…</div>
        ) : (users.data ?? []).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No users found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last sign in</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.full_name ?? <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {u.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {u.role ? (
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">no role</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={confirmDelete === u.id ? "destructive" : "ghost"}
                      disabled={busy}
                      onClick={() => handleDelete(u.id, u.email)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      {confirmDelete === u.id ? "Confirm remove" : "Remove"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
