import type { MemberDisplayType } from "@app/components/poke/members/columns";
import { makeColumnsForMembers } from "@app/components/poke/members/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import {
  isMembershipSeatType,
  MEMBERSHIP_ORIGIN_TYPES,
  MEMBERSHIP_ROLE_TYPES,
  MEMBERSHIP_SEAT_TYPES,
  type MembershipSeatType,
} from "@app/types/memberships";
import type {
  RoleType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types/user";

function prepareMembersForDisplay(
  members: UserTypeWithWorkspaces[]
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
    };
  });
}

interface MembersDataTableProps {
  groupName?: string;
  members: UserTypeWithWorkspaces[];
  owner: WorkspaceType;
  readonly?: boolean;
}

export function MembersDataTable({
  groupName,
  members,
  owner,
  readonly,
}: MembersDataTableProps) {
  const router = useAppRouter();

  const onRevokeMember = async (m: MemberDisplayType) => {
    if (!window.confirm(`Are you sure you want to revoke ${m.email}?`)) {
      return;
    }

    try {
      const r = await clientFetch(`/api/poke/workspaces/${owner.sId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: m.sId,
        }),
      });
      if (!r.ok) {
        throw new Error("Failed to revoke user.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while revoking the user.");
    }
  };

  const onUpdateMemberRole = async (m: MemberDisplayType, role: RoleType) => {
    if (
      !window.confirm(
        `Are you sure you want to update role of ${m.email} to ${role}?`
      )
    ) {
      return;
    }

    try {
      const r = await clientFetch(`/api/poke/workspaces/${owner.sId}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: m.sId,
          role,
        }),
      });
      if (!r.ok) {
        throw new Error("Failed to update user role.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert(`An error occurred while updating the user role: ${e}`);
    }
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

    try {
      const r = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/seat_type`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: m.sId,
            seatType,
          }),
        }
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Failed to update seat type.");
      }
      router.reload();
    } catch (e) {
      window.alert(`An error occurred while updating the seat type: ${e}`);
    }
  };

  return (
    <>
      <div className="border-material-200 my-4 flex w-full flex-col rounded-lg border p-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-md mb-4 font-bold">
            {groupName ? `"${groupName}" Members:` : "Members:"}
          </h2>
        </div>
        <PokeDataTable
          columns={makeColumnsForMembers({
            onRevokeMember,
            onUpdateMemberRole,
            onUpdateMemberSeatType,
            readonly,
          })}
          data={prepareMembersForDisplay(members)}
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
