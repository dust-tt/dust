import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type {
  DriftState,
  SuperuserMemberInfo,
} from "@app/lib/api/poke/superusers";
import type { PokeRole } from "@app/lib/poke/roles";
import { PokeRoleSchema } from "@app/lib/poke/roles";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import {
  useGrantSuperuser,
  usePokeSuperusers,
  useRepairSuperuserDrift,
  useRevokeSuperuser,
  useUpdateSuperuserRoles,
} from "@app/poke/swr/superusers";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Button, Chip, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const ROLE_OPTIONS: PokeRole[] = PokeRoleSchema.options;

function driftChipColor(drift: DriftState): "success" | "warning" | "primary" {
  switch (drift) {
    case "ok":
      return "success";
    case "db_only":
      return "warning";
    case "roles_only":
      return "warning";
    case "none":
      return "primary";
    default:
      assertNeverAndIgnore(drift);
      return "primary";
  }
}

interface RoleSelectorProps {
  selectedRoles: PokeRole[];
  onToggle: (role: PokeRole) => void;
}

function RoleSelector({ selectedRoles, onToggle }: RoleSelectorProps) {
  const selectedSet = new Set(selectedRoles);

  return (
    <div className="flex flex-col gap-1 py-1">
      {ROLE_OPTIONS.map((role) => (
        <label key={role} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedSet.has(role)}
            onChange={() => onToggle(role)}
          />
          {role}
        </label>
      ))}
    </div>
  );
}

interface SuperusersPageProps {}

export function SuperusersPage({}: SuperusersPageProps) {
  usePokePageMetadata({ name: "Superusers" });

  const {
    members,
    generation,
    isSuperusersLoading,
    isSuperusersError,
    mutateSuperusers,
  } = usePokeSuperusers();

  const grantSuperuser = useGrantSuperuser(mutateSuperusers);
  const revokeSuperuser = useRevokeSuperuser(mutateSuperusers);
  const updateSuperuserRoles = useUpdateSuperuserRoles(mutateSuperusers);
  const repairSuperuserDrift = useRepairSuperuserDrift(mutateSuperusers);

  const [editingSId, setEditingSId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<
    "grant" | "update-roles" | "repair-db-only" | null
  >(null);
  const [selectedRoles, setSelectedRoles] = useState<PokeRole[]>([]);
  const [mutating, setMutating] = useState(false);

  const handleToggleRole = useCallback((role: PokeRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }, []);

  const startGrant = useCallback((member: SuperuserMemberInfo) => {
    setEditingSId(member.sId);
    setEditingAction("grant");
    setSelectedRoles(member.pokeRoles);
  }, []);

  const startUpdateRoles = useCallback((member: SuperuserMemberInfo) => {
    setEditingSId(member.sId);
    setEditingAction("update-roles");
    setSelectedRoles(member.pokeRoles);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingSId(null);
    setEditingAction(null);
    setSelectedRoles([]);
  }, []);

  const confirmGrant = useCallback(
    async (member: SuperuserMemberInfo) => {
      if (selectedRoles.length === 0) {
        return;
      }
      if (
        !window.confirm(
          `Grant superuser access to ${member.email} with roles: ${selectedRoles.join(", ")}?`
        )
      ) {
        return;
      }
      setMutating(true);
      await grantSuperuser(member.sId, selectedRoles, generation);
      setMutating(false);
      cancelEditing();
    },
    [selectedRoles, generation, grantSuperuser, cancelEditing]
  );

  const confirmUpdateRoles = useCallback(
    async (member: SuperuserMemberInfo) => {
      if (selectedRoles.length === 0) {
        return;
      }
      if (
        !window.confirm(
          `Update roles for ${member.email} to: ${selectedRoles.join(", ")}?`
        )
      ) {
        return;
      }
      setMutating(true);
      await updateSuperuserRoles(member.sId, selectedRoles, generation);
      setMutating(false);
      cancelEditing();
    },
    [selectedRoles, generation, updateSuperuserRoles, cancelEditing]
  );

  const handleRevoke = useCallback(
    async (member: SuperuserMemberInfo) => {
      if (
        !window.confirm(
          `Revoke superuser access for ${member.email}? This will remove the DB flag and all poke roles.`
        )
      ) {
        return;
      }
      setMutating(true);
      await revokeSuperuser(member.sId, generation);
      setMutating(false);
    },
    [generation, revokeSuperuser]
  );

  const startRepairDbOnly = useCallback((member: SuperuserMemberInfo) => {
    setEditingSId(member.sId);
    setEditingAction("repair-db-only");
    setSelectedRoles([]);
  }, []);

  const confirmRepairDbOnly = useCallback(
    async (member: SuperuserMemberInfo) => {
      if (selectedRoles.length === 0) {
        return;
      }
      if (
        !window.confirm(
          `Repair drift for ${member.email} with roles: ${selectedRoles.join(", ")}?`
        )
      ) {
        return;
      }
      setMutating(true);
      await repairSuperuserDrift(member.sId, generation, selectedRoles);
      setMutating(false);
      cancelEditing();
    },
    [selectedRoles, generation, repairSuperuserDrift, cancelEditing]
  );

  const handleRepairDrift = useCallback(
    async (member: SuperuserMemberInfo) => {
      if (
        !window.confirm(
          `Repair drift for ${member.email}? Current drift state: ${member.driftState}`
        )
      ) {
        return;
      }
      setMutating(true);
      await repairSuperuserDrift(member.sId, generation);
      setMutating(false);
    },
    [generation, repairSuperuserDrift]
  );

  const columns: ColumnDef<SuperuserMemberInfo>[] = useMemo(
    () => [
      {
        accessorKey: "fullName",
        header: ({ column }) => (
          <PokeColumnSortableHeader column={column} label="Name" />
        ),
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <PokeColumnSortableHeader column={column} label="Email" />
        ),
      },
      {
        accessorKey: "membershipRole",
        header: "Membership Role",
      },
      {
        accessorKey: "isDustSuperUser",
        header: "DB Flag",
        cell: ({ row }) => {
          const val = row.original.isDustSuperUser;
          return (
            <Chip
              color={val ? "success" : "primary"}
              size="xs"
              label={val ? "true" : "false"}
            />
          );
        },
      },
      {
        accessorKey: "pokeRoles",
        header: "Poke Roles",
        cell: ({ row }) => {
          const roles = row.original.pokeRoles;
          if (roles.length === 0) {
            return <span className="text-muted-foreground">none</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <Chip key={role} color="info" size="xs" label={role} />
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "driftState",
        header: "Drift",
        cell: ({ row }) => {
          const drift = row.original.driftState;
          return <Chip color={driftChipColor(drift)} size="xs" label={drift} />;
        },
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const member = row.original;
          const isEditing = editingSId === member.sId;

          if (isEditing && editingAction === "grant") {
            return (
              <div className="flex flex-col gap-2">
                <RoleSelector
                  selectedRoles={selectedRoles}
                  onToggle={handleToggleRole}
                />
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="primary"
                    label="Confirm"
                    disabled={mutating || selectedRoles.length === 0}
                    onClick={() => void confirmGrant(member)}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    label="Cancel"
                    disabled={mutating}
                    onClick={cancelEditing}
                  />
                </div>
              </div>
            );
          }

          if (isEditing && editingAction === "update-roles") {
            return (
              <div className="flex flex-col gap-2">
                <RoleSelector
                  selectedRoles={selectedRoles}
                  onToggle={handleToggleRole}
                />
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="primary"
                    label="Save"
                    disabled={mutating || selectedRoles.length === 0}
                    onClick={() => void confirmUpdateRoles(member)}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    label="Cancel"
                    disabled={mutating}
                    onClick={cancelEditing}
                  />
                </div>
              </div>
            );
          }

          if (isEditing && editingAction === "repair-db-only") {
            return (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  Select roles for repair:
                </span>
                <RoleSelector
                  selectedRoles={selectedRoles}
                  onToggle={handleToggleRole}
                />
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="primary"
                    label="Repair"
                    disabled={mutating || selectedRoles.length === 0}
                    onClick={() => void confirmRepairDbOnly(member)}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    label="Cancel"
                    disabled={mutating}
                    onClick={cancelEditing}
                  />
                </div>
              </div>
            );
          }

          const buttons: JSX.Element[] = [];

          if (!member.isDustSuperUser && member.driftState !== "roles_only") {
            buttons.push(
              <Button
                key="grant"
                size="xs"
                variant="primary"
                label="Grant"
                disabled={mutating || editingSId !== null}
                onClick={() => startGrant(member)}
              />
            );
          }

          if (member.driftState === "roles_only") {
            buttons.push(
              <Button
                key="restore-access"
                size="xs"
                variant="primary"
                label="Restore Access"
                disabled={mutating || editingSId !== null}
                onClick={() => void handleRepairDrift(member)}
              />
            );
            buttons.push(
              <Button
                key="remove-roles"
                size="xs"
                variant="warning"
                label="Remove Roles"
                disabled={mutating || editingSId !== null}
                onClick={() => void handleRevoke(member)}
              />
            );
          }

          if (member.isDustSuperUser) {
            buttons.push(
              <Button
                key="update-roles"
                size="xs"
                variant="outline"
                label="Edit Roles"
                disabled={mutating || editingSId !== null}
                onClick={() => startUpdateRoles(member)}
              />
            );
            buttons.push(
              <Button
                key="revoke"
                size="xs"
                variant="warning"
                label="Revoke"
                disabled={mutating || editingSId !== null}
                onClick={() => void handleRevoke(member)}
              />
            );
          }

          if (member.driftState === "db_only") {
            buttons.push(
              <Button
                key="repair"
                size="xs"
                variant="outline"
                label="Repair Drift"
                disabled={mutating || editingSId !== null}
                onClick={() => startRepairDbOnly(member)}
              />
            );
          }

          if (buttons.length === 0) {
            return null;
          }

          return <div className="flex flex-wrap gap-1">{buttons}</div>;
        },
      },
    ],
    [
      editingSId,
      editingAction,
      selectedRoles,
      mutating,
      handleToggleRole,
      confirmGrant,
      confirmUpdateRoles,
      cancelEditing,
      startGrant,
      startUpdateRoles,
      startRepairDbOnly,
      confirmRepairDbOnly,
      handleRevoke,
      handleRepairDrift,
    ]
  );

  if (isSuperusersLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </main>
    );
  }

  if (isSuperusersError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-red-600">
          Failed to load superuser data. Please try again.
        </p>
      </main>
    );
  }

  if (members.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">
          No superuser-relevant members found.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <PokeDataTable
        columns={columns}
        data={members}
        defaultFilterColumn="email"
        pageSize={25}
      />
    </main>
  );
}
