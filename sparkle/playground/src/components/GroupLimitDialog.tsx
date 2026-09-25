import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Input,
  RadioGroup,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  addGroupLimit,
  BILLING_CYCLE_RESET_LABEL,
  diffMembers,
  editGroupLimit,
  formatCreditAmount,
  getDrawingMemberIds,
  getGroup,
  getGroupMemberIds,
  getGroupUsage,
  getGroupLimitUser,
  getMemberLimitedGroups,
  type GroupLimitPlan,
  type GroupLimitsState,
  removeGroupLimit,
  resolveLimitGroup,
  type UsageGroup,
} from "../data/groupLimits";
import {
  LimitGroupSummary,
  MemberIdentity,
  MemberLimitChanges,
  SectionTitle,
  UsageBar,
  RadioCard,
} from "./GroupLimitShared";

export type GroupLimitDialogMode = "add" | "edit" | "remove";

interface GroupLimitDialogProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  groupId: string;
  mode: GroupLimitDialogMode;
  initialDraft?: string;
  onClose: () => void;
  onApply: (next: GroupLimitsState, message: string) => void;
  onShowMembers: (groupId: string) => void;
}

type Step = "amount" | "conflicts" | "remove";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function perMemberLabelIfDrawingFrom(
  state: GroupLimitsState,
  userId: string,
  group: UsageGroup
) {
  const personal = state.members[userId].personalLimit;
  if (personal !== null) {
    return `Personal limit applies: ${formatCreditAmount(personal)}`;
  }
  if (group.perMemberLimit !== null) {
    return `Limit per member: ${formatCreditAmount(group.perMemberLimit)}`;
  }
  return `Workspace default: ${formatCreditAmount(state.workspaceDefaultLimit)}`;
}

export function GroupLimitDialog(props: GroupLimitDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent size="lg">
        <GroupLimitDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function GroupLimitDialogBody({
  state,
  plan,
  groupId,
  mode,
  initialDraft,
  onClose,
  onApply,
  onShowMembers,
}: GroupLimitDialogProps) {
  const group = getGroup(state, groupId);
  const [step, setStep] = useState<Step>(
    mode === "remove" ? "remove" : "amount"
  );
  const [draft, setDraft] = useState<string>(
    initialDraft ??
      (mode === "edit" && group.groupLimit !== null
        ? String(group.groupLimit)
        : "")
  );
  const amount = draft === "" ? null : Number(draft);

  const memberIds = getGroupMemberIds(state, groupId);
  const conflictIds =
    mode === "add"
      ? memberIds.filter((userId) => resolveLimitGroup(state, userId) !== null)
      : [];
  const autoIds =
    mode === "add"
      ? memberIds.filter((userId) => resolveLimitGroup(state, userId) === null)
      : [];
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      conflictIds.map((userId) => [
        userId,
        resolveLimitGroup(state, userId)?.group.id ?? groupId,
      ])
    )
  );
  const movedCount = conflictIds.filter((id) => choices[id] === groupId).length;

  const preview = useMemo(() => {
    if (step === "remove") {
      return removeGroupLimit(state, groupId);
    }
    if (amount === null) {
      return state;
    }
    return mode === "add"
      ? addGroupLimit(state, groupId, amount, choices)
      : editGroupLimit(state, groupId, amount);
  }, [state, groupId, step, amount, mode, choices]);
  const changes = diffMembers(state, preview, plan, memberIds);

  const used = getGroupUsage(state, groupId);
  const drawingIds = getDrawingMemberIds(state, groupId);

  if (step === "remove") {
    return (
      <RemoveStep
        preview={preview}
        group={group}
        drawingIds={drawingIds}
        used={used}
        changes={changes}
        onBack={mode === "edit" ? () => setStep("amount") : undefined}
        onClose={onClose}
        onConfirm={() =>
          onApply(preview, `${group.name}'s group limit was removed`)
        }
      />
    );
  }

  if (step === "conflicts" && amount !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {plural(conflictIds.length, "member")} already draw
            {conflictIds.length === 1 ? "s" : ""} from another group
          </DialogTitle>
          <DialogDescription>
            A member draws from one limit group at a time. Choose where each of
            them draws from. Spend already made stays with the current group:
            members who move start at 0 in {group.name}.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <SectionTitle
              trailing={
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    label="Keep all"
                    onClick={() =>
                      setChoices(
                        Object.fromEntries(
                          conflictIds.map((userId) => [
                            userId,
                            resolveLimitGroup(state, userId)?.group.id ??
                              groupId,
                          ])
                        )
                      )
                    }
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    label={`Move all to ${group.name}`}
                    onClick={() =>
                      setChoices(
                        Object.fromEntries(
                          conflictIds.map((userId) => [userId, groupId])
                        )
                      )
                    }
                  />
                </>
              }
            >
              {movedCount} of {conflictIds.length} moving to {group.name}
            </SectionTitle>
            {conflictIds.map((userId) => {
              const current = resolveLimitGroup(state, userId);
              if (!current) {
                return null;
              }
              const currentGroup = current.group;
              return (
                <div
                  key={userId}
                  className="flex flex-col gap-3 rounded-xl border border-border p-3"
                >
                  <MemberIdentity
                    userId={userId}
                    secondary={`Currently draws from ${currentGroup.name}${current.source === "default" && getMemberLimitedGroups(state, userId).length > 1 ? " (default: group joined first)" : ""}`}
                  />
                  <RadioGroup
                    value={choices[userId]}
                    onValueChange={(value) =>
                      setChoices((prev) => ({ ...prev, [userId]: value }))
                    }
                    className="grid grid-cols-2 gap-2"
                  >
                    <RadioCard
                      value={currentGroup.id}
                      id={`${userId}-keep`}
                      iconPosition="start"
                      cardClassName="rounded-lg bg-muted-background p-2"
                      customItem={
                        <LimitGroupSummary
                          name={`Keep ${currentGroup.name}`}
                          used={getGroupUsage(state, currentGroup.id)}
                          limit={currentGroup.groupLimit}
                          perMemberLabel={perMemberLabelIfDrawingFrom(
                            state,
                            userId,
                            currentGroup
                          )}
                        />
                      }
                    />
                    <RadioCard
                      value={groupId}
                      id={`${userId}-move`}
                      iconPosition="start"
                      cardClassName="rounded-lg bg-muted-background p-2"
                      customItem={
                        <LimitGroupSummary
                          name={`Move to ${group.name}`}
                          used={0}
                          limit={amount}
                          perMemberLabel={perMemberLabelIfDrawingFrom(
                            state,
                            userId,
                            group
                          )}
                        />
                      }
                    />
                  </RadioGroup>
                </div>
              );
            })}
            <MemberLimitChanges changes={changes} />
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button
            variant="outline"
            label="Back"
            onClick={() => setStep("amount")}
          />
          <Button
            variant="highlight"
            label="Set group limit"
            onClick={() =>
              onApply(
                preview,
                `${group.name} now has a group limit of ${formatCreditAmount(amount)} credits`
              )
            }
          />
        </DialogFooter>
      </>
    );
  }

  const isLowering =
    mode === "edit" && amount !== null && amount <= used && used > 0;
  const unblocks =
    mode === "edit" &&
    group.groupLimit !== null &&
    used >= group.groupLimit &&
    amount !== null &&
    amount > used;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "add"
            ? `Add a group limit to ${group.name}`
            : `Edit ${group.name}'s group limit`}
        </DialogTitle>
        <DialogDescription>
          A group limit caps what the members drawing from {group.name} can use,
          together, from the workspace credit pool in a billing cycle. It comes
          on top of each member's limit per member.
        </DialogDescription>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          {mode === "edit" && group.groupLimit !== null && (
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <UsageBar
                used={used}
                limit={group.groupLimit}
                label={`${group.name} group limit`}
                size="md"
              />
              <span className="text-xs text-muted-foreground">
                Used this cycle by the{" "}
                <Hoverable
                  variant="highlight"
                  onClick={() => onShowMembers(groupId)}
                >
                  {plural(drawingIds.length, "member")} drawing from{" "}
                  {group.name}
                </Hoverable>
                . Resets on {BILLING_CYCLE_RESET_LABEL}.
              </span>
            </div>
          )}
          <Input
            label="Group limit"
            inputMode="numeric"
            placeholder="e.g. 10,000"
            value={draft === "" ? "" : Number(draft).toLocaleString("en-US")}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            suffix="credits/month"
            isUnit
            autoFocus
          />
          {mode === "add" && (
            <ul className="flex flex-col gap-2 text-sm text-foreground">
              <li>
                <span className="font-semibold">
                  {plural(autoIds.length, "member")} will draw from {group.name}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — they have no limit group today and start drawing from{" "}
                  {group.name} automatically.
                </span>
              </li>
              {conflictIds.length > 0 && (
                <li>
                  <span className="font-semibold">
                    {plural(conflictIds.length, "member")} already draw
                    {conflictIds.length === 1 ? "s" : ""} from another group
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    — you'll choose whether they stay or move to {group.name}{" "}
                    next.
                  </span>
                </li>
              )}
              <li className="text-muted-foreground">
                Usage counts from now until the end of the billing cycle (
                {BILLING_CYCLE_RESET_LABEL}): {group.name} starts at 0.
              </li>
            </ul>
          )}
          {isLowering && amount !== null && (
            <ContentMessage
              size="lg"
              variant="warning"
              title={`${plural(drawingIds.length, "member")} will be blocked right away`}
            >
              {group.name} has already used {formatCreditAmount(used)} credits
              this cycle. With a limit of {formatCreditAmount(amount)}, every
              member drawing from {group.name}
              {plan === "seats" ? " who has used up their seat allowance" : ""}{" "}
              is blocked until the cycle resets on {BILLING_CYCLE_RESET_LABEL},
              unless you raise the limit or move them to another limit group.
            </ContentMessage>
          )}
          {unblocks && (
            <ContentMessage
              size="lg"
              variant="success"
              title="Unblocks members"
            >
              {group.name} is currently at its limit. Raising it to{" "}
              {formatCreditAmount(amount ?? 0)} unblocks the members drawing
              from it.
            </ContentMessage>
          )}
          {(mode === "edit" || conflictIds.length === 0) && (
            <MemberLimitChanges
              changes={
                isLowering
                  ? changes.map((c) => ({ ...c, becomesBlocked: false }))
                  : changes
              }
            />
          )}
        </div>
      </DialogContainer>
      <DialogFooter>
        {mode === "edit" && (
          <Button
            variant="warning-ghost"
            label="Remove limit"
            className="mr-auto"
            onClick={() => setStep("remove")}
          />
        )}
        <Button variant="outline" label="Cancel" onClick={onClose} />
        {mode === "add" && conflictIds.length > 0 ? (
          <Button
            variant="highlight"
            label="Next"
            disabled={amount === null || amount === 0}
            onClick={() => setStep("conflicts")}
          />
        ) : (
          <Button
            variant="highlight"
            label={mode === "add" ? "Set group limit" : "Save"}
            disabled={amount === null || amount === 0}
            onClick={() =>
              onApply(
                preview,
                mode === "add"
                  ? `${group.name} now has a group limit of ${formatCreditAmount(amount ?? 0)} credits`
                  : `${group.name}'s group limit is now ${formatCreditAmount(amount ?? 0)} credits`
              )
            }
          />
        )}
      </DialogFooter>
    </>
  );
}

function RemoveStep({
  preview,
  group,
  drawingIds,
  used,
  changes,
  onBack,
  onClose,
  onConfirm,
}: {
  preview: GroupLimitsState;
  group: UsageGroup;
  drawingIds: string[];
  used: number;
  changes: ReturnType<typeof diffMembers>;
  onBack?: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const destinations = drawingIds.map((userId) => ({
    userId,
    next: resolveLimitGroup(preview, userId),
  }));
  const toOther = destinations.filter((d) => d.next !== null);
  const toNone = destinations.filter((d) => d.next === null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Remove {group.name}'s group limit</DialogTitle>
        <DialogDescription>
          The {plural(drawingIds.length, "member")} drawing from {group.name}{" "}
          will stop sharing a group limit. The {formatCreditAmount(used)}{" "}
          credits spent this cycle stay recorded on {group.name}.
          {group.perMemberLimit !== null &&
            ` ${group.name} keeps its limit per member (${formatCreditAmount(group.perMemberLimit)} credits/month).`}
        </DialogDescription>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <SectionTitle>Where they will draw from next</SectionTitle>
            <span className="text-xs text-muted-foreground">
              Members in another group with a group limit move to the one they
              joined first, starting at 0 there. The others have no limit group.
            </span>
            {toOther.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {plural(toOther.length, "member")} will draw from another
                  group
                </span>
                {toOther.map(({ userId, next }) => (
                  <MemberIdentity
                    key={userId}
                    userId={userId}
                    secondary={`Will draw from ${next?.group.name} (joined first)`}
                  />
                ))}
              </div>
            )}
            {toNone.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {plural(toNone.length, "member")} will have no limit group
                </span>
                <span className="text-sm text-foreground">
                  {toNone
                    .map((d) => getGroupLimitUser(d.userId).fullName)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
          <MemberLimitChanges changes={changes} />
        </div>
      </DialogContainer>
      <DialogFooter>
        {onBack && (
          <Button
            variant="outline"
            label="Back"
            className="mr-auto"
            onClick={onBack}
          />
        )}
        <Button variant="outline" label="Cancel" onClick={onClose} />
        <Button variant="warning" label="Remove limit" onClick={onConfirm} />
      </DialogFooter>
    </>
  );
}
