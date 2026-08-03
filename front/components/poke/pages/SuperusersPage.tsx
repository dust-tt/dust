import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { SuperuserMemberInfo } from "@app/lib/api/poke/superusers";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import {
  usePokeSuperusers,
  useSuperuserMutations,
} from "@app/poke/swr/superusers";
import { type PokeRole, PokeRoleSchema } from "@app/types/poke/roles";
import { Button, Chip, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const ROLE_OPTIONS = PokeRoleSchema.options;

function RoleSelector({
  roles,
  onChange,
}: {
  roles: PokeRole[];
  onChange: (roles: PokeRole[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 py-1">
      {ROLE_OPTIONS.map((role) => (
        <label key={role} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={roles.includes(role)}
            onChange={() =>
              onChange(
                roles.includes(role)
                  ? roles.filter((candidate) => candidate !== role)
                  : [...roles, role]
              )
            }
          />
          {role}
        </label>
      ))}
    </div>
  );
}

export function SuperusersPage() {
  usePokePageMetadata({ name: "Superusers" });
  const { members, orphanedRoleEntries, isLoading, error, mutate } =
    usePokeSuperusers();
  const { setRoles, setDustSuperUser } = useSuperuserMutations(mutate);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<PokeRole[]>([]);
  const [busy, setBusy] = useState(false);

  function edit(member: SuperuserMemberInfo) {
    setEditingEmail(member.email);
    setSelectedRoles(member.pokeRoles);
  }

  function cancelEdit() {
    setEditingEmail(null);
    setSelectedRoles([]);
  }

  async function saveRoles(email: string) {
    if (selectedRoles.length === 0) {
      return;
    }
    setBusy(true);
    const success = await setRoles(email, selectedRoles);
    setBusy(false);
    if (success) {
      cancelEdit();
    }
  }

  async function removeRoles(email: string) {
    if (!window.confirm(`Remove ${email} from poke-roles.json?`)) {
      return;
    }
    setBusy(true);
    const success = await setRoles(email, null);
    setBusy(false);
    if (success) {
      cancelEdit();
    }
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
      cell: ({ row }) => {
        const member = row.original;
        if (editingEmail === member.email) {
          return (
            <div className="space-y-2">
              <RoleSelector roles={selectedRoles} onChange={setSelectedRoles} />
              <div className="flex gap-1">
                <Button
                  size="xs"
                  variant="primary"
                  label="Save"
                  disabled={busy || selectedRoles.length === 0}
                  onClick={() => void saveRoles(member.email)}
                />
                <Button
                  size="xs"
                  variant="outline"
                  label="Cancel"
                  disabled={busy}
                  onClick={cancelEdit}
                />
              </div>
            </div>
          );
        }
        if (!member.hasPokeRoleEntry) {
          return <span className="text-muted-foreground">not in JSON</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {member.pokeRoles.map((role) => (
              <Chip key={role} color="info" size="xs" label={role} />
            ))}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const member = row.original;
        return (
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant="outline"
              label={member.hasPokeRoleEntry ? "Edit roles" : "Add to Poke"}
              disabled={busy || editingEmail !== null}
              onClick={() => edit(member)}
            />
            {member.hasPokeRoleEntry && (
              <Button
                size="xs"
                variant="warning"
                label="Remove from Poke"
                disabled={busy}
                onClick={() => void removeRoles(member.email)}
              />
            )}
            <Button
              size="xs"
              variant="outline"
              label={
                member.isDustSuperUser
                  ? "Disable Dust superuser"
                  : "Enable Dust superuser"
              }
              disabled={busy}
              onClick={() => void toggleSuperuser(member)}
            />
          </div>
        );
      },
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

      {orphanedRoleEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            Entries outside the workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            These JSON entries do not match an active member of the Dust
            workspace.
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
