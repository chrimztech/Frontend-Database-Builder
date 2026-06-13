import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { listUsers, createUser, deleteUser } from "@/lib/api/users.functions";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";

function generatePassword(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(14)))
    .map((byte) => CHARSET[byte % CHARSET.length])
    .join("");
}

export function UsersTab() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
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

  const userList = users.data ?? [];
  const adminCount = userList.filter((user) => user.role === "admin").length;
  const neverSignedIn = userList.filter((user) => !user.last_sign_in_at).length;

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

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || !email || !password) {
      return;
    }

    setBusy(true);
    try {
      await createUser({
        data: {
          full_name: fullName.trim(),
          email,
          password,
          role,
          phone: phone.trim() || undefined,
        },
      });

      toast.success(
        `Account created for ${fullName.trim()}. Share the temporary password with them.`,
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword(generatePassword());
      setCopied(false);
      setRole("user");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error: any) {
      toast.error(error.message ?? "Failed to create user");
    } finally {
      setBusy(false);
    }
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
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error: any) {
      toast.error(error.message ?? "Failed to remove user");
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Security"
        title="Authorised users"
        description="Only accounts created here can sign in. New users receive a temporary password and are required to set a permanent one on first access."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Users" value={userList.length} hint="Total staff accounts with portal access" />
        <AdminStat label="Admins" value={adminCount} hint="Full-access administrative accounts" />
        <AdminStat label="Pending activation" value={neverSignedIn} hint="Accounts that have never signed in yet" />
        <AdminStat
          label="Roles"
          value={userList.length > 0 ? `${adminCount}/${userList.length}` : "0/0"}
          hint="Admin accounts as a share of the full user base"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <AdminPanel className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="kicker">Provision Access</p>
              <h3 className="mt-2 text-2xl text-foreground">Create a staff account</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Generate a temporary password, assign the correct access role, and
                provision the user directly into the admin portal.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" htmlFor="new-name">
                <Input
                  id="new-name"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="e.g. Jane Banda"
                />
              </Field>
              <Field label="Phone number" htmlFor="new-phone">
                <Input
                  id="new-phone"
                  type="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="e.g. 0977123456"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email address *" htmlFor="new-email">
                <Input
                  id="new-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="user@example.com"
                />
              </Field>
              <Field label="Role" htmlFor="new-role">
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as "admin" | "user")}
                >
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - full access</SelectItem>
                    <SelectItem value="user">User - standard access</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Temporary password" htmlFor="temp-password">
              <div className="flex flex-wrap gap-2">
                <Input
                  id="temp-password"
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-[220px] flex-1 font-mono"
                  required
                  minLength={8}
                />
                <Button type="button" variant="outline" size="icon" onClick={copyPassword} title="Copy password">
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={regenerate}
                  title="Generate new password"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Copy this before submitting. The user will need it for the first
                sign-in, then the system will prompt them to replace it.
              </p>
            </Field>

            <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-4 shadow-[var(--shadow-soft)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Security reminder
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Use the smallest role that still lets the person do their job. Admin
                    access should be reserved for certificate operations leads.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !fullName.trim() || !email || !password}
            >
              {busy ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader
            title="Current users"
            description="Review active staff accounts, last sign-in behaviour, and remove access when it is no longer needed."
          />

          <div className="px-5 py-5 sm:px-6">
            {users.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading users...</div>
            ) : userList.length === 0 ? (
              <AdminEmptyState
                title="No users found"
                description="Create the first staff account to get the admin portal into active use."
              />
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
                  {userList.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.full_name ?? (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.phone ?? "-"}
                      </TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">no role</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.last_sign_in_at
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={confirmDelete === user.id ? "destructive" : "outline"}
                          disabled={busy}
                          onClick={() => handleDelete(user.id, user.email)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {confirmDelete === user.id ? "Confirm remove" : "Remove"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}
