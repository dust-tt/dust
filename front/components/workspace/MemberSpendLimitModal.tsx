import { useSendNotification } from "@app/hooks/useNotification";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import { useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import { useUpdateUserSpendLimit } from "@app/lib/swr/memberships";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GroupType } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Chip,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Page,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

const MIN_AWU_CREDITS = 0;
const MAX_AWU_CREDITS = 2_000_000;

interface MemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  // Poke has no working write route for per-member or per-group spend limits
  // yet, so in read-only mode Validate just notifies instead of mutating.
  readOnly?: boolean;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  // Fired once the spend limit has been persisted successfully (not on cancel
  // or a load error). Used to resolve a linked upgrade request as approved.
  onSaved?: () => void;
}

type GroupRow = {
  groupId: string;
  name: string;
  poolCapAwuCredits: number | null;
  memberCount: number;
  isHighest: boolean;
  onClick?: () => void;
};

function parseCreditsInput(
  raw: string
): { ok: true; awuCredits: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, awuCredits: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < MIN_AWU_CREDITS) {
    return {
      ok: false,
      message: `Enter a whole number of credits between ${MIN_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  if (parsed > MAX_AWU_CREDITS) {
    return {
      ok: false,
      message: `Credits cannot exceed ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  return { ok: true, awuCredits: parsed };
}

function groupRowsForMember(
  member: MemberUsageType | null,
  groups: GroupType[]
): GroupRow[] {
  const hasPersonalOverride = member?.spendLimitSource === "override";
  const memberGroups: GroupType[] = removeNulls(
    (member?.groups ?? []).map((groupName) =>
      groups.find((g) => g.name === groupName)
    )
  );

  // When there's no personal override, the highest group cap the member is
  // part of is the one currently granting their extra credits.
  const highestGroupId = memberGroups.reduce<string | null>((highestSId, g) => {
    if (g.poolCapAwuCredits === null) {
      return highestSId;
    }
    const highest = memberGroups.find((h) => h.sId === highestSId);
    if (!highest || g.poolCapAwuCredits > (highest.poolCapAwuCredits ?? -1)) {
      return g.sId;
    }
    return highestSId;
  }, null);

  return memberGroups.map((g) => ({
    groupId: g.sId,
    name: g.name,
    poolCapAwuCredits: g.poolCapAwuCredits,
    memberCount: g.memberCount,
    isHighest: !hasPersonalOverride && g.sId === highestGroupId,
  }));
}

interface GroupLimitTableProps {
  rows: GroupRow[];
  readOnly: boolean;
  groupLimitInputs: Record<string, string>;
  groupValidationMessages: Record<string, string | null>;
  onChange: (groupId: string, cleaned: string) => void;
}

function GroupLimitTable({
  rows,
  readOnly,
  groupLimitInputs,
  groupValidationMessages,
  onChange,
}: GroupLimitTableProps) {
  const groupColumns: ColumnDef<GroupRow, string>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Group",
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span
              className={
                row.original.isHighest
                  ? "font-semibold text-highlight-500"
                  : undefined
              }
            >
              {row.original.name}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        id: "poolCapAwuCredits",
        header: "Limit",
        accessorFn: (row) => String(row.poolCapAwuCredits ?? ""),
        meta: { className: "w-48" },
        cell: ({ row }) => {
          const groupId = row.original.groupId;
          const draft = groupLimitInputs[groupId] ?? "";
          const message = groupValidationMessages[groupId] ?? null;
          return (
            <Input
              size="sm"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="No limit"
              disabled={readOnly}
              value={draft !== "" ? Number(draft).toLocaleString() : ""}
              onChange={(e) => {
                onChange(groupId, e.target.value.replace(/[^\d]/g, ""));
              }}
              isError={message !== null}
              message={message ?? undefined}
              messageStatus={message !== null ? "error" : undefined}
              suffix="credits/month"
              isUnit
            />
          );
        },
      },
      {
        id: "memberCount",
        header: "Members",
        accessorFn: (row) => row.memberCount.toString(),
        meta: { headerAlign: "right" },
        cell: ({ row }) => (
          <span className="block text-right text-sm text-muted-foreground">
            {row.original.memberCount.toLocaleString()}
          </span>
        ),
      },
    ],
    [readOnly, groupLimitInputs, groupValidationMessages, onChange]
  );

  return (
    <div className="overflow-x-auto">
      <DataTable data={rows} columns={groupColumns} />
    </div>
  );
}

interface PersonalLimitInputProps {
  value: string;
  readOnly: boolean;
  isHighest: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
}

function PersonalLimitInput({
  value,
  readOnly,
  isHighest,
  validationMessage,
  onChange,
}: PersonalLimitInputProps) {
  return (
    <Page.Vertical gap="xs" align="stretch">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          Personal limit
        </span>
        {isHighest && <Chip size="mini" color="highlight" label="Highest" />}
      </div>
      <Input
        size="sm"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0"
        disabled={readOnly}
        value={value !== "" ? Number(value).toLocaleString() : ""}
        onChange={(e) => {
          onChange(e.target.value.replace(/[^\d]/g, ""));
        }}
        isError={validationMessage !== null}
        message={validationMessage ?? undefined}
        messageStatus={validationMessage !== null ? "error" : undefined}
        suffix="credits/month"
        isUnit
      />
    </Page.Vertical>
  );
}

interface MemberSpendLimitFormProps {
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  readOnly: boolean;
  onClose: () => void;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  onSaved?: () => void;
}

function MemberSpendLimitForm({
  member,
  owner,
  groups,
  readOnly,
  onClose,
  onSavingChange,
  onSaved,
}: MemberSpendLimitFormProps) {
  const sendNotification = useSendNotification();
  const notifySaveUnavailable = () =>
    sendNotification({
      title: "Not available from Poke yet",
      description: "Editing spend limits from Poke isn't supported yet.",
      type: "info",
    });

  const { doUpdateSpendLimit } = useUpdateUserSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });

  const seatAllowanceAwuCredits = member?.memberUsageLimit ?? 0;
  const effectiveLimitAwuCredits = member?.spendLimitAwuCredits ?? 0;
  const extraAwuCredits = Math.max(
    0,
    effectiveLimitAwuCredits - seatAllowanceAwuCredits
  );
  const hasPersonalOverride = member?.spendLimitSource === "override";
  const initialPersonalOverride = hasPersonalOverride ? extraAwuCredits : null;

  const memberGroupRows = useMemo(
    () => groupRowsForMember(member, groups),
    [member, groups]
  );

  const [personalLimitInput, setPersonalLimitInput] = useState<string>(() =>
    hasPersonalOverride ? String(extraAwuCredits) : ""
  );
  const [groupLimitInputs, setGroupLimitInputs] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      memberGroupRows.map((row) => [
        row.groupId,
        row.poolCapAwuCredits === null ? "" : String(row.poolCapAwuCredits),
      ])
    )
  );
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [groupValidationMessages, setGroupValidationMessages] = useState<
    Record<string, string | null>
  >({});

  function handleGroupLimitChange(groupId: string, cleaned: string) {
    setGroupLimitInputs((prev) => ({
      ...prev,
      [groupId]: cleaned,
    }));
    setGroupValidationMessages((prev) => ({
      ...prev,
      [groupId]: null,
    }));
  }

  async function handleValidate() {
    if (readOnly) {
      notifySaveUnavailable();
      return;
    }
    if (!member) {
      return;
    }

    const personalResult = parseCreditsInput(personalLimitInput);
    setValidationMessage(personalResult.ok ? null : personalResult.message);

    const groupResults = memberGroupRows.map((row) => ({
      row,
      result: parseCreditsInput(groupLimitInputs[row.groupId] ?? ""),
    }));
    setGroupValidationMessages(
      Object.fromEntries(
        groupResults.map(({ row, result }) => [
          row.groupId,
          result.ok ? null : result.message,
        ])
      )
    );

    if (!personalResult.ok || groupResults.some(({ result }) => !result.ok)) {
      return;
    }

    const personalChanged =
      personalResult.awuCredits !== initialPersonalOverride;
    const groupChanges = groupResults.filter(
      ({ row, result }) =>
        result.ok && result.awuCredits !== row.poolCapAwuCredits
    );

    if (!personalChanged && groupChanges.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    onSavingChange?.(member.sId, true);
    try {
      const tasks: Array<() => Promise<unknown>> = [];
      if (personalChanged) {
        const limit =
          personalResult.awuCredits === null
            ? ({ kind: "unlimited" } as const)
            : ({
                kind: "limited",
                awuCredits: personalResult.awuCredits,
              } as const);
        tasks.push(() =>
          doUpdateSpendLimit({
            memberId: member.sId,
            memberName: member.name,
            limit,
          })
        );
      }
      for (const { row, result } of groupChanges) {
        if (!result.ok) {
          continue;
        }
        const limit =
          result.awuCredits === null
            ? ({ kind: "unlimited" } as const)
            : ({ kind: "limited", awuCredits: result.awuCredits } as const);
        tasks.push(() =>
          doUpdateGroupSpendLimit({
            groupId: row.groupId,
            groupName: row.name,
            limit,
          })
        );
      }

      const results = await concurrentExecutor(tasks, (task) => task(), {
        concurrency: 8,
      });
      if (results.every((result) => result !== null)) {
        onSaved?.();
        onClose();
      }
    } finally {
      setIsSaving(false);
      onSavingChange?.(member.sId, false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col gap-2">
          <Avatar
            visual={member?.image ?? undefined}
            name={member?.name}
            size="md"
            isRounded
          />
          <div>
            <DialogTitle>Edit spend limit for {member?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This user can currently consume{" "}
              {formatCredits(seatAllowanceAwuCredits)} credits from their seat,
              plus {formatCredits(extraAwuCredits)} on the&nbsp;pool.
            </p>
          </div>
        </div>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          <PersonalLimitInput
            value={personalLimitInput}
            readOnly={readOnly}
            isHighest={hasPersonalOverride}
            validationMessage={validationMessage}
            onChange={(cleaned) => {
              setPersonalLimitInput(cleaned);
              setValidationMessage(null);
            }}
          />

          {memberGroupRows.length > 0 && (
            <Page.Vertical gap="xs" align="stretch">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                Group limit
              </span>
              <GroupLimitTable
                rows={memberGroupRows}
                readOnly={readOnly}
                groupLimitInputs={groupLimitInputs}
                groupValidationMessages={groupValidationMessages}
                onChange={handleGroupLimitChange}
              />
            </Page.Vertical>
          )}
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        }}
        rightButtonProps={{
          label: "Validate",
          variant: "highlight",
          disabled: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}

export function MemberSpendLimitModal({
  isOpen,
  onClose,
  member,
  owner,
  groups,
  readOnly = false,
  onSavingChange,
  onSaved,
}: MemberSpendLimitModalProps) {
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  useEffect(() => {
    if (member) {
      lastMemberRef.current = member;
    }
  }, [member]);
  const displayedMember = member ?? lastMemberRef.current;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        <MemberSpendLimitForm
          // Remounts with fresh draft state on every open and whenever the
          // targeted member changes, instead of syncing state from props.
          key={`${displayedMember?.sId ?? "none"}:${isOpen}`}
          member={displayedMember}
          owner={owner}
          groups={groups}
          readOnly={readOnly}
          onClose={onClose}
          onSavingChange={onSavingChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
