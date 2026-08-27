import type { MemberDisplayType } from "@app/components/poke/members/columns";
import { makeColumnsForMembers } from "@app/components/poke/members/columns";
import { MembersBulkActions } from "@app/components/poke/members/MembersBulkActions";
import type { BatchMemberUpdate } from "@app/components/poke/members/useBatchUpdateMembers";
import { useBatchUpdateMembers } from "@app/components/poke/members/useBatchUpdateMembers";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeWorkspaceMember } from "@app/lib/api/poke/memberships";
import { useAppRouter } from "@app/lib/platform";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  isMembershipSeatType,
  MEMBERSHIP_ORIGIN_TYPES,
  MEMBERSHIP_ROLE_TYPES,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";

function prepareMembersForDisplay(
  members: PokeWorkspaceMember[]
): MemberDisplayType[] {
  return members.map((m) => {
    return {
      createdAt: m.createdAt,
      lastLoginAt: m.lastLoginAt,
      email: m.email,
      name: m.fullName,
      role: m.workspaces[0].role,
      sId: m.sId,
      origin: m.origin,
      seatType: isMembershipSeatType(m.seatType) ? m.seatType : undefined,
      scheduledSeatType: m.scheduledSeatType,
      scheduledSeatChangeAt: m.scheduledSeatChangeAt,
    };
  });
}

interface MembersDataTableProps {
  // Seat types selectable in the seat dropdown. When undefined, all seat types
  // are offered; typically restricted to the current contract's seats.
  availableSeatTypes?: readonly MembershipSeatType[];
  groupName?: string;
  members: PokeWorkspaceMember[];
  owner: WorkspaceType;
  readonly?: boolean;
}

export function MembersDataTable({
  availableSeatTypes,
  groupName,
  members,
  owner,
  readonly,
}: MembersDataTableProps) {
  const router = useAppRouter();
  const { runBatchUpdate } = useBatchUpdateMembers({ owner });

  // Per-row mutations run the same "batch-update-members" plugin as the bulk
  // toolbar, just with a single user ID.
  const applyToMember = async (
    m: MemberDisplayType,
    update: BatchMemberUpdate,
    context: string
  ) => {
    const res = await runBatchUpdate(update, [m.sId]);
    if (res.isErr()) {
      window.alert(`An error occurred while ${context}: ${res.error}`);
      return;
    }
    const failure = res.value.find(
      (r) => r.status === "failed" || r.status === "user_not_found"
    );
    if (failure) {
      window.alert(
        `An error occurred while ${context}: ${failure.error ?? failure.status}`
      );
      return;
    }
    router.reload();
  };

  const onRevokeMember = async (m: MemberDisplayType) => {
    if (!window.confirm(`Are you sure you want to revoke ${m.email}?`)) {
      return;
    }
    await applyToMember(m, { action: "revoke" }, "revoking the user");
  };

  const onUpdateMemberRole = async (
    m: MemberDisplayType,
    role: ActiveRoleType
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to update role of ${m.email} to ${role}?`
      )
    ) {
      return;
    }
    await applyToMember(
      m,
      { action: "update_role", role },
      "updating the user role"
    );
  };

  const onUpdateMemberSeatType = async (
    m: MemberDisplayType,
    seatType: MembershipSeatType
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to update seat type of ${m.email} to ${seatType}?`
      )
    ) {
      return;
    }
    await applyToMember(
      m,
      { action: "update_seat", seatType },
      "updating the seat type"
    );
  };

  return (
    <>
      <div className="my-4 flex w-full flex-col rounded-lg border p-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-md mb-4 font-bold">
            {groupName ? `"${groupName}" Members:` : "Members:"}
          </h2>
        </div>
        <PokeDataTable
          columns={makeColumnsForMembers({
            availableSeatTypes,
            onRevokeMember,
            onUpdateMemberRole,
            onUpdateMemberSeatType,
            readonly,
          })}
          data={prepareMembersForDisplay(members)}
          enableRowSelection={!readonly}
          getRowId={(row) => row.sId}
          getRowClassName={(row) =>
            row.role === "none" ? "text-gray-400" : undefined
          }
          renderBulkActions={
            readonly
              ? undefined
              : ({ selectedRows, resetSelection }) => (
                  <MembersBulkActions
                    availableSeatTypes={availableSeatTypes}
                    members={selectedRows}
                    onDone={resetSelection}
                    owner={owner}
                  />
                )
          }
          facets={[
            {
              columnId: "origin",
              title: "Origin",
              options: MEMBERSHIP_ORIGIN_TYPES.map((o) => ({
                label: o,
                value: o,
              })),
            },
            {
              columnId: "role",
              title: "Role",
              options: [...MEMBERSHIP_ROLE_TYPES, "none"].map((r) => ({
                label: r,
                value: r,
              })),
            },
            {
              columnId: "seatType",
              title: "Seat type",
              options: [...MEMBERSHIP_SEAT_TYPES].map((st) => ({
                label: st,
                value: st,
              })),
            },
          ]}
        />
      </div>
    </>
  );
}
