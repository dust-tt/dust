import type { MemberDisplayType } from "@app/components/poke/members/columns";
import type { BatchMemberUpdate } from "@app/components/poke/members/useBatchUpdateMembers";
import { useBatchUpdateMembers } from "@app/components/poke/members/useBatchUpdateMembers";
import { useAppRouter } from "@app/lib/platform";
import type { MembershipSeatType } from "@app/types/memberships";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import type { ActiveRoleType, WorkspaceType } from "@app/types/user";
import { ASSIGNABLE_ROLES } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface MembersBulkActionsProps {
  // Seat types offered in the "Set seat type" menu. Defaults to all seat types.
  availableSeatTypes?: readonly MembershipSeatType[];
  members: MemberDisplayType[];
  // Called once the bulk operation finished (to clear the selection).
  onDone: () => void;
  owner: WorkspaceType;
}

export function MembersBulkActions({
  availableSeatTypes,
  members,
  onDone,
  owner,
}: MembersBulkActionsProps) {
  const router = useAppRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { runBatchUpdate } = useBatchUpdateMembers({ owner });

  // Role updates re-activate revoked members, so they apply to everyone.
  // Seat updates only make sense on active members; revoke additionally
  // excludes provisioned members (mirrors the per-row revoke button).
  const activeMembers = members.filter((m) => m.role !== "none");
  const revocableMembers = activeMembers.filter(
    (m) => m.origin !== "provisioned"
  );

  const runBulk = async (
    verb: string,
    eligible: MemberDisplayType[],
    update: BatchMemberUpdate
  ) => {
    if (eligible.length === 0) {
      window.alert(`None of the selected members can be ${verb}.`);
      return;
    }

    const skipped = members.length - eligible.length;
    const confirmMessage =
      `Are you sure you want to ${verb} ${eligible.length} member(s)?` +
      (skipped > 0 ? ` (${skipped} ineligible will be skipped)` : "");
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsSubmitting(true);
    const res = await runBatchUpdate(
      update,
      eligible.map((m) => m.sId)
    );
    setIsSubmitting(false);

    if (res.isErr()) {
      window.alert(`The bulk action failed: ${res.error}`);
      return;
    }

    const failures = res.value.filter(
      (r) => r.status === "failed" || r.status === "user_not_found"
    );
    if (failures.length > 0) {
      window.alert(
        `${res.value.length - failures.length}/${res.value.length} succeeded.\n\n` +
          `Issues:\n` +
          failures
            .map((r) => `${r.email ?? r.identifier}: ${r.error ?? r.status}`)
            .join("\n")
      );
    }

    onDone();
    router.reload();
  };

  const onSetRole = (role: ActiveRoleType) =>
    runBulk("set the role of", members, { action: "update_role", role });

  const onSetSeatType = (seatType: MembershipSeatType) =>
    runBulk("set the seat type of", activeMembers, {
      action: "update_seat",
      seatType,
    });

  const onRevoke = () =>
    runBulk("revoke", revocableMembers, { action: "revoke" });

  const seatTypes = availableSeatTypes ?? MEMBERSHIP_SEAT_TYPES;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            isSelect
            label="Set role"
            disabled={isSubmitting}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {ASSIGNABLE_ROLES.map((role) => (
            <DropdownMenuItem key={role} onClick={() => onSetRole(role)}>
              {role}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            isSelect
            label="Set seat type"
            disabled={isSubmitting}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {seatTypes.map((st) => (
            <DropdownMenuItem key={st} onClick={() => onSetSeatType(st)}>
              {st}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="warning"
        size="xs"
        icon={Trash01}
        label="Revoke"
        disabled={isSubmitting}
        onClick={onRevoke}
      />
    </div>
  );
}
