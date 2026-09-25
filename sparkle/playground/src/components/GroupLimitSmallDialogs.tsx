import {
  Button,
  Chip,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  changeSeat,
  diffMembers,
  formatCreditAmount,
  getBlockedReason,
  getDrawingMemberIds,
  getGroup,
  getGroupMemberIds,
  getGroupUsage,
  getGroupLimitUser,
  getMemberLimitedGroups,
  getSeatAllowanceLeft,
  type GroupLimitPlan,
  type GroupLimitsState,
  resolveLimitGroup,
  SEAT_ALLOWANCES,
  setLimitGroup,
  type UsageGroup,
} from "../data/groupLimits";
import {
  LimitGroupChip,
  LimitGroupSummary,
  MemberIdentity,
  MemberLimitChanges,
  SectionTitle,
  UsageBar,
  RadioCard,
} from "./GroupLimitShared";

const DEFAULT_CHOICE = "__default__";

function perMemberLabel(state: GroupLimitsState, group: UsageGroup) {
  return group.perMemberLimit !== null
    ? `Limit per member: ${formatCreditAmount(group.perMemberLimit)}`
    : `No limit per member (workspace default: ${formatCreditAmount(state.workspaceDefaultLimit)})`;
}

interface BulkLimitGroupDialogProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  userIds: string[];
  onClose: () => void;
  onApply: (next: GroupLimitsState, message: string) => void;
}

export function BulkLimitGroupDialog({
  state,
  plan,
  userIds,
  onClose,
  onApply,
}: BulkLimitGroupDialogProps) {
  const options = state.groups.filter(
    (g) =>
      g.groupLimit !== null &&
      userIds.some((userId) =>
        getMemberLimitedGroups(state, userId).some((lg) => lg.id === g.id)
      )
  );
  const [choice, setChoice] = useState<string>(
    options[0]?.id ?? DEFAULT_CHOICE
  );

  const eligible = (userId: string) =>
    choice === DEFAULT_CHOICE ||
    getMemberLimitedGroups(state, userId).some((g) => g.id === choice);

  const preview = useMemo(() => {
    let next = state;
    for (const userId of userIds) {
      if (eligible(userId)) {
        next = setLimitGroup(
          next,
          userId,
          choice === DEFAULT_CHOICE ? null : choice
        );
      }
    }
    return next;
  }, [state, userIds, choice]);
  const changes = diffMembers(state, preview, plan, userIds);
  const applied = userIds.filter(eligible).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            Set limit group for {userIds.length} member
            {userIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Members draw from one limit group. Those who move start at 0 in
            their new group; spend already made stays with the previous group.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-5">
            <RadioGroup
              value={choice}
              onValueChange={setChoice}
              className="flex flex-col gap-2"
            >
              {options.map((g) => (
                <RadioCard
                  key={g.id}
                  value={g.id}
                  id={`bulk-${g.id}`}
                  iconPosition="start"
                  cardClassName={cn(
                    "rounded-xl border p-3",
                    choice === g.id ? "border-highlight" : "border-border"
                  )}
                  customItem={
                    <LimitGroupSummary
                      name={g.name}
                      used={getGroupUsage(state, g.id)}
                      limit={g.groupLimit}
                      perMemberLabel={perMemberLabel(state, g)}
                    />
                  }
                />
              ))}
              <RadioCard
                value={DEFAULT_CHOICE}
                id="bulk-default"
                iconPosition="start"
                cardClassName={cn(
                  "rounded-xl border p-3",
                  choice === DEFAULT_CHOICE
                    ? "border-highlight"
                    : "border-border"
                )}
                customItem={
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Default
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Each member draws from the limited group they joined
                      first.
                    </span>
                  </div>
                }
              />
            </RadioGroup>
            <div className="flex flex-col gap-2">
              <SectionTitle>
                {applied} of {userIds.length} will change
              </SectionTitle>
              {userIds.map((userId) => {
                const before = resolveLimitGroup(state, userId);
                const after = resolveLimitGroup(preview, userId);
                let secondary: string;
                if (!eligible(userId)) {
                  secondary = `Not in ${getGroup(state, choice).name}: unchanged${before ? `, keeps ${before.group.name}` : ""}`;
                } else if (!after) {
                  secondary = "No group with a group limit";
                } else if (before?.group.id === after.group.id) {
                  secondary = `Keeps ${after.group.name}${after.source === "default" ? " (default)" : ""}`;
                } else {
                  secondary = `${before?.group.name ?? "No limit group"} → ${after.group.name}, starts at 0`;
                }
                return (
                  <MemberIdentity
                    key={userId}
                    userId={userId}
                    secondary={secondary}
                  />
                );
              })}
            </div>
            <MemberLimitChanges changes={changes} />
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button variant="outline" label="Cancel" onClick={onClose} />
          <Button
            variant="highlight"
            label="Apply"
            disabled={applied === 0}
            onClick={() =>
              onApply(
                preview,
                `Limit group updated for ${applied} member${applied === 1 ? "" : "s"}`
              )
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LimitGroupMembersDialogProps {
  state: GroupLimitsState;
  groupId: string;
  onClose: () => void;
  onOpenMember: (userId: string) => void;
  onEditGroupLimit: (groupId: string) => void;
}

export function LimitGroupMembersDialog({
  state,
  groupId,
  onClose,
  onOpenMember,
  onEditGroupLimit,
}: LimitGroupMembersDialogProps) {
  const group = getGroup(state, groupId);
  const memberIds = getGroupMemberIds(state, groupId);
  const drawing = getDrawingMemberIds(state, groupId);
  const drawingMembers = drawing.filter((id) => memberIds.includes(id));
  const elsewhere = memberIds.filter((id) => !drawing.includes(id));
  const formerSpend =
    getGroupUsage(state, groupId) -
    drawingMembers.reduce(
      (sum, id) => sum + (state.members[id].spendByGroup[groupId] ?? 0),
      0
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Who counts in {group.name}</DialogTitle>
          <DialogDescription>
            {drawingMembers.length} of {memberIds.length} members draw from this
            group.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-5">
            {group.groupLimit !== null && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <UsageBar
                  used={getGroupUsage(state, groupId)}
                  limit={group.groupLimit}
                  label={`${group.name} group limit`}
                  size="md"
                />
                {formerSpend > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Includes {formatCreditAmount(formerSpend)} credits spent by
                    members who now draw from another group.
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <SectionTitle>
                Draw from {group.name} ({drawingMembers.length})
              </SectionTitle>
              {drawingMembers.map((userId) => {
                const source = resolveLimitGroup(state, userId)?.source;
                return (
                  <button
                    key={userId}
                    type="button"
                    className="flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted-background"
                    onClick={() => onOpenMember(userId)}
                  >
                    <div className="min-w-0 flex-1">
                      <MemberIdentity
                        userId={userId}
                        secondary={
                          getMemberLimitedGroups(state, userId).length === 1
                            ? "Only group with a group limit"
                            : source === "default"
                              ? "Default: group joined first"
                              : "Chosen explicitly"
                        }
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCreditAmount(
                        state.members[userId].spendByGroup[groupId] ?? 0
                      )}{" "}
                      credits
                    </span>
                  </button>
                );
              })}
            </div>
            {elsewhere.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionTitle>
                  Draw from another group ({elsewhere.length})
                </SectionTitle>
                <span className="text-xs text-muted-foreground">
                  Their spend doesn't count toward {group.name}, and{" "}
                  {group.name}'s limit per member doesn't apply to them.
                </span>
                {elsewhere.map((userId) => {
                  const other = resolveLimitGroup(state, userId);
                  return (
                    <button
                      key={userId}
                      type="button"
                      className="flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted-background"
                      onClick={() => onOpenMember(userId)}
                    >
                      <div className="min-w-0 flex-1">
                        <MemberIdentity userId={userId} />
                      </div>
                      {other && (
                        <LimitGroupChip
                          name={other.group.name}
                          isDefault={other.source === "default"}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContainer>
        <DialogFooter>
          {group.groupLimit !== null && (
            <Button
              variant="outline"
              label="Edit group limit"
              className="mr-auto"
              onClick={() => onEditGroupLimit(groupId)}
            />
          )}
          <Button variant="highlight" label="Done" onClick={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ChangeSeatDialogProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  userId: string;
  onClose: () => void;
  onApply: (next: GroupLimitsState, message: string) => void;
}

export function ChangeSeatDialog({
  state,
  plan,
  userId,
  onClose,
  onApply,
}: ChangeSeatDialogProps) {
  const user = getGroupLimitUser(userId);
  const preview = changeSeat(state, userId, "max");
  const blocked = getBlockedReason(state, userId, plan);
  const stillBlocked = getBlockedReason(preview, userId, plan);
  const left = getSeatAllowanceLeft(preview, userId, plan);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Change {user.fullName}'s seat</DialogTitle>
          <DialogDescription>
            Pro seat ({formatCreditAmount(SEAT_ALLOWANCES.pro)} credits) → Max
            seat ({formatCreditAmount(SEAT_ALLOWANCES.max)} credits). Billed pro
            rata from today.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-2 text-sm text-foreground">
            <span>
              {user.firstName} gets {formatCreditAmount(left)} credits of seat
              allowance left this cycle. Spend covered by the seat allowance
              doesn't count toward any group limit.
            </span>
            {blocked && !stillBlocked && (
              <span className="flex items-center gap-2">
                <Chip size="mini" color="success" label="Unblocks" />
                {user.firstName} can use Dust again until the new allowance is
                used up.
              </span>
            )}
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button variant="outline" label="Cancel" onClick={onClose} />
          <Button
            variant="highlight"
            label="Change to Max"
            onClick={() =>
              onApply(preview, `${user.fullName} now has a Max seat`)
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
