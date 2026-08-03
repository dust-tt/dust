import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { useSuperusersAdmin } from "@app/poke/swr/superusers";
import {
  type PokeRole,
  PokeRoleSchema,
  type SuperuserMemberInfo,
} from "@app/types/poke/roles";
import { Button, Chip, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const ROLE_OPTIONS = PokeRoleSchema.options;

export function SuperusersPage() {
  usePokePageMetadata({ name: "Superusers" });
  const {
    members,
    orphanedRoleEntries,
    isLoading,
    error,
    auditUnavailable,
    setRoles,
    setDustSuperUser,
  } = useSuperusersAdmin();
  const [busy, setBusy] = useState(false);

  async function updateRoles(member: SuperuserMemberInfo, role: PokeRole) {
    const roles = member.pokeRoles.includes(role)
      ? member.pokeRoles.filter((candidate) => candidate !== role)
      : [...member.pokeRoles, role];
    setBusy(true);
    await setRoles(member.email, roles);
    setBusy(false);
  }

  async function removeRoles(email: string) {
    if (!window.confirm(`Remove ${email} from poke-roles.json?`)) {
      return;
    }
    setBusy(true);
    await setRoles(email, null);
    setBusy(false);
  }

  async function toggleSuperuser(member: SuperuserMemberInfo) {
    const nextValue = !member.isDustSuperUser;
    if (
      !window.confirm(
        `Set isDustSuperUser=${String(nextValue)} for ${member.email}?`
      )
    ) {
      return;
    }
    setBusy(true);
    await setDustSuperUser(member.sId, nextValue);
    setBusy(false);
  }

  const columns: ColumnDef<SuperuserMemberInfo>[] = [
    { accessorKey: "fullName", header: "Name" },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "membershipRole", header: "Workspace role" },
    {
      accessorKey: "isDustSuperUser",
      header: "DB flag",
      cell: ({ row }) => (
        <Chip
          color={row.original.isDustSuperUser ? "success" : "primary"}
          size="xs"
          label={String(row.original.isDustSuperUser)}
        />
      ),
    },
    {
      accessorKey: "pokeRoles",
      header: "Poke roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-3 py-1">
          {ROLE_OPTIONS.map((role) => (
            <label key={role} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={row.original.pokeRoles.includes(role)}
                disabled={busy}
                onChange={() => void updateRoles(row.original, role)}
              />
              {role}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.hasPokeRoleEntry && (
            <Button
              size="xs"
              variant="warning"
              label="Remove from Poke"
              disabled={busy}
              onClick={() => void removeRoles(row.original.email)}
            />
          )}
          <Button
            size="xs"
            variant="outline"
            label={
              row.original.isDustSuperUser
                ? "Disable Dust superuser"
                : "Enable Dust superuser"
            }
            disabled={busy}
            onClick={() => void toggleSuperuser(row.original)}
          />
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <Spinner />;
  }
  if (error) {
    return (
      <p className="text-sm text-red-600">Failed to load superuser data.</p>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PokeDataTable
        columns={columns}
        data={members}
        defaultFilterColumn="email"
        pageSize={25}
      />

      {auditUnavailable && (
        <p className="text-sm text-warning-500">
          Cross-region membership audit and orphan removal are unavailable.
        </p>
      )}

      {orphanedRoleEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            Entries outside both Dust workspaces
          </h2>
          <p className="text-sm text-muted-foreground">
            These JSON entries do not match an active member in either region.
          </p>
          {orphanedRoleEntries.map((entry) => (
            <div
              key={entry.email}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div>
                <div className="text-sm font-medium">{entry.email}</div>
                <div className="text-sm text-muted-foreground">
                  {entry.pokeRoles.join(", ") || "no roles"}
                </div>
              </div>
              <Button
                size="xs"
                variant="warning"
                label="Remove from JSON"
                disabled={busy}
                onClick={() => void removeRoles(entry.email)}
              />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
