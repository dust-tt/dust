import {
  Avatar,
  Button,
  Chip,
  cn,
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
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BILLING_CYCLE_RESET_LABEL,
  diffMembers,
  formatCreditAmount,
  getBlockedReason,
  getGroupUsage,
  getGroupLimitUser,
  getMemberGroups,
  getMemberLimitedGroups,
  getMemberPoolSpend,
  getPerMemberLimit,
  getSeatAllowance,
  type GroupLimitPlan,
  type GroupLimitsState,
  resolveLimitGroup,
  setLimitGroup,
  setPersonalLimit,
} from "../data/groupLimits";
import { perMemberLabelIfDrawingFrom } from "./GroupLimitDialog";
import {
  LimitGroupSummary,
  MemberLimitChanges,
  SectionTitle,
  RadioCard,
} from "./GroupLimitShared";

interface EditMemberLimitDialogProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  userId: string;
  focusLimitGroup?: boolean;
  onClose: () => void;
  onApply: (next: GroupLimitsState, message: string) => void;
  onEditGroupLimit: (groupId: string) => void;
  onChangeSeat: (userId: string) => void;
}

export function EditMemberLimitDialog(props: EditMemberLimitDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent size="lg">
        <EditMemberLimitBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function EditMemberLimitBody({
  state,
  plan,
  userId,
  focusLimitGroup,
  onClose,
  onApply,
  onEditGroupLimit,
  onChangeSeat,
}: EditMemberLimitDialogProps) {
  const user = getGroupLimitUser(userId);
  const member = state.members[userId];
  const [personalDraft, setPersonalDraft] = useState(
    member.personalLimit === null ? "" : String(member.personalLimit)
  );
  const [limitGroupDraft, setLimitGroupDraft] = useState<string | null>(
    member.explicitLimitGroupId
  );
  const limitGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusLimitGroup) {
      limitGroupRef.current?.scrollIntoView({ block: "center" });
    }
  }, [focusLimitGroup]);

  const preview = useMemo(
    () =>
      setPersonalLimit(
        setLimitGroup(state, userId, limitGroupDraft),
        userId,
        personalDraft === "" ? null : Number(personalDraft)
      ),
    [state, userId, limitGroupDraft, personalDraft]
  );

  const poolSpend = getMemberPoolSpend(state, userId);
  const currentLimit = getPerMemberLimit(state, userId);
  const previewLimit = getPerMemberLimit(preview, userId);
  const blocked = getBlockedReason(state, userId, plan);
  const previewBlocked = getBlockedReason(preview, userId, plan);
  const currentLimitGroup = resolveLimitGroup(state, userId);
  const previewLimitGroup = resolveLimitGroup(preview, userId);
  const limitedGroups = getMemberLimitedGroups(state, userId);
  const defaultGroup = limitedGroups[0] ?? null;
  const groups = getMemberGroups(state, userId);
  const isMoving =
    currentLimitGroup !== null &&
    previewLimitGroup !== null &&
    currentLimitGroup.group.id !== previewLimitGroup.group.id;
  const change = diffMembers(state, preview, plan, [userId]);
  const seatAllowance = getSeatAllowance(member, plan);

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col gap-2">
          <Avatar
            visual={user.portrait}
            name={user.fullName}
            size="md"
            isRounded
          />
          <div>
            <DialogTitle>Edit limits for {user.fullName}</DialogTitle>
            <DialogDescription>
              {plan === "seats" &&
                `${user.firstName} has used ${formatCreditAmount(member.seatUsed)} of the ${formatCreditAmount(seatAllowance)} credits in their ${member.seat === "max" ? "Max" : "Pro"} seat, plus `}
              {plan === "seats" ? "" : `${user.firstName} has used `}
              {formatCreditAmount(poolSpend)} of{" "}
              {formatCreditAmount(currentLimit.value)} credits from the
              workspace pool this cycle.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-6">
          {blocked?.kind === "groupLimit" && (
            <ContentMessage
              size="lg"
              variant="warning"
              title={`Blocked by ${blocked.group.name}'s group limit`}
            >
              <div className="flex flex-col gap-2">
                <span>
                  {blocked.group.name} has used all of its{" "}
                  {formatCreditAmount(blocked.group.groupLimit ?? 0)} credits
                  this cycle. Raising {user.firstName}'s personal limit won't
                  unblock them. Raise {blocked.group.name}'s group limit, move{" "}
                  {user.firstName} to another limit group below
                  {plan === "seats" ? ", or change their seat" : ""}.
                </span>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    label={`Raise ${blocked.group.name}'s limit`}
                    onClick={() => onEditGroupLimit(blocked.group.id)}
                  />
                  {plan === "seats" && (
                    <Button
                      size="xs"
                      variant="outline"
                      label="Change seat"
                      onClick={() => onChangeSeat(userId)}
                    />
                  )}
                </div>
              </div>
            </ContentMessage>
          )}
          {blocked?.kind === "memberLimit" && (
            <ContentMessage
              size="lg"
              variant="warning"
              title="Blocked by their limit per member"
            >
              {user.firstName} has used their{" "}
              {formatCreditAmount(currentLimit.value)} credits for this cycle.
              Set a higher personal limit to unblock them
              {plan === "seats" ? ", or change their seat" : ""}.
            </ContentMessage>
          )}

          <div className="flex flex-col gap-2">
            <SectionTitle
              trailing={
                personalDraft !== "" && (
                  <Button
                    size="xs"
                    variant="ghost"
                    label="Remove personal limit"
                    onClick={() => setPersonalDraft("")}
                  />
                )
              }
            >
              <span className="flex items-center gap-2">
                Personal limit
                {previewLimit.source.kind === "personal" && (
                  <Chip size="mini" color="highlight" label="Active" />
                )}
              </span>
            </SectionTitle>
            <Input
              size="sm"
              inputMode="numeric"
              placeholder="No personal limit"
              value={
                personalDraft === ""
                  ? ""
                  : Number(personalDraft).toLocaleString("en-US")
              }
              onChange={(e) =>
                setPersonalDraft(e.target.value.replace(/[^\d]/g, ""))
              }
              suffix="credits/month"
              isUnit
              message="A personal limit wins over any group."
            />
          </div>

          <div className="flex flex-col gap-2">
            <SectionTitle>Limit per member</SectionTitle>
            <span className="text-xs text-muted-foreground">
              {previewLimitGroup
                ? `${user.firstName}'s limit group (${previewLimitGroup.group.name}) sets their limit per member, or the workspace default if it has none.`
                : `${user.firstName} has no limit group: the highest limit per member across their groups applies.`}
            </span>
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {groups.map((g) => {
                const isActive =
                  (previewLimit.source.kind === "limitGroup" ||
                    previewLimit.source.kind === "highestGroup") &&
                  previewLimit.source.group.id === g.id;
                return (
                  <div
                    key={g.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm",
                      isActive
                        ? "font-semibold text-highlight"
                        : "text-foreground"
                    )}
                  >
                    <span>{g.name}</span>
                    {isActive && (
                      <Chip size="mini" color="highlight" label="Active" />
                    )}
                    {previewLimitGroup?.group.id === g.id && (
                      <Chip size="mini" color="primary" label="Limit group" />
                    )}
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {g.perMemberLimit === null
                        ? "—"
                        : `${formatCreditAmount(g.perMemberLimit)} credits/month`}
                    </span>
                  </div>
                );
              })}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm",
                  previewLimit.source.kind === "workspaceDefault" ||
                    previewLimit.source.kind === "limitGroupDefault"
                    ? "font-semibold text-highlight"
                    : "text-muted-foreground"
                )}
              >
                <span>Workspace default</span>
                {(previewLimit.source.kind === "workspaceDefault" ||
                  previewLimit.source.kind === "limitGroupDefault") && (
                  <Chip size="mini" color="highlight" label="Active" />
                )}
                <span className="ml-auto tabular-nums">
                  {formatCreditAmount(state.workspaceDefaultLimit)}{" "}
                  credits/month
                </span>
              </div>
            </div>
          </div>

          <div ref={limitGroupRef} className="flex flex-col gap-2">
            <SectionTitle>Limit group</SectionTitle>
            {limitedGroups.length === 0 && (
              <span className="text-sm text-muted-foreground">
                {user.firstName} is in no group with a group limit, so no group
                limit applies.
              </span>
            )}
            {limitedGroups.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {limitedGroups.length === 1
                    ? `${limitedGroups[0].name} is ${user.firstName}'s only group with a group limit.`
                    : `${user.firstName} is in ${limitedGroups.length} groups with a group limit and draws from one of them. Without a choice, it's the group they joined first.`}
                </span>
                <RadioGroup
                  value={previewLimitGroup?.group.id}
                  onValueChange={setLimitGroupDraft}
                  className="flex flex-col gap-2"
                >
                  {limitedGroups.map((g) => (
                    <RadioCard
                      key={g.id}
                      value={g.id}
                      id={`limit-group-${g.id}`}
                      iconPosition="start"
                      disabled={limitedGroups.length === 1}
                      cardClassName={cn(
                        "rounded-xl border p-3",
                        previewLimitGroup?.group.id === g.id
                          ? "border-highlight"
                          : "border-border"
                      )}
                      customItem={
                        <LimitGroupSummary
                          name={g.name}
                          used={getGroupUsage(state, g.id)}
                          limit={g.groupLimit}
                          perMemberLabel={perMemberLabelIfDrawingFrom(
                            state,
                            userId,
                            g
                          )}
                          badge={
                            <>
                              {currentLimitGroup?.group.id === g.id && (
                                <Chip size="mini" label="Current" />
                              )}
                              {limitedGroups.length > 1 &&
                                defaultGroup?.id === g.id && (
                                  <Chip
                                    size="mini"
                                    color={
                                      previewLimitGroup?.source === "default"
                                        ? "highlight"
                                        : "primary"
                                    }
                                    label={
                                      previewLimitGroup?.source === "default"
                                        ? "Default · joined first"
                                        : "Joined first"
                                    }
                                  />
                                )}
                            </>
                          }
                        />
                      }
                    />
                  ))}
                </RadioGroup>
                {limitedGroups.length > 1 && limitGroupDraft !== null && (
                  <span className="text-xs text-muted-foreground">
                    Explicit choice.{" "}
                    <Hoverable
                      variant="highlight"
                      onClick={() => setLimitGroupDraft(null)}
                    >
                      Reset to default (group joined first)
                    </Hoverable>
                  </span>
                )}
              </>
            )}
            {isMoving && currentLimitGroup && previewLimitGroup && (
              <ContentMessage
                size="lg"
                variant="blue"
                title={`${user.firstName} will draw from ${previewLimitGroup.group.name}`}
              >
                {user.firstName} starts at 0 in {previewLimitGroup.group.name}.
                The{" "}
                {formatCreditAmount(
                  state.members[userId].spendByGroup[
                    currentLimitGroup.group.id
                  ] ?? 0
                )}{" "}
                credits already spent this cycle stay with{" "}
                {currentLimitGroup.group.name}.
                {blocked &&
                  !previewBlocked &&
                  ` This unblocks ${user.firstName}.`}
                {previewBlocked?.kind === "groupLimit" &&
                  ` ${previewBlocked.group.name} has reached its limit too: ${user.firstName} would stay blocked until ${BILLING_CYCLE_RESET_LABEL}.`}
              </ContentMessage>
            )}
          </div>
          <MemberLimitChanges
            changes={change}
            title={`${user.firstName}'s limit per member will change`}
          />
        </div>
      </DialogContainer>
      <DialogFooter>
        <Button variant="outline" label="Cancel" onClick={onClose} />
        <Button
          variant="highlight"
          label="Save"
          onClick={() =>
            onApply(preview, `Limits updated for ${user.fullName}`)
          }
        />
      </DialogFooter>
    </>
  );
}
