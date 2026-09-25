import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  BILLING_CYCLE_RESET_LABEL,
  formatCreditAmount,
  getBlockedReason,
  getGroupLimitUser,
  getGroupUsage,
  getMemberIds,
  getMemberPoolSpend,
  getPerMemberLimit,
  getSeatAllowanceLeft,
  type GroupLimitPlan,
  type GroupLimitsState,
  resolveLimitGroup,
  setGroupUsageForDemo,
} from "../data/groupLimits";
import { InputBar } from "./InputBar";

export type MemberViewRole = "member" | "admin";

interface GroupLimitMemberViewProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  userId: string;
  role: MemberViewRole;
  onUserChange: (userId: string) => void;
  onRoleChange: (role: MemberViewRole) => void;
  onStateChange: (next: GroupLimitsState) => void;
  onManageGroupLimits: () => void;
}

type Banner = { message: string; tone: "neutral" | "warning" } | null;

function computeBanner(
  state: GroupLimitsState,
  plan: GroupLimitPlan,
  userId: string
): Banner {
  const blocked = getBlockedReason(state, userId, plan);
  const limitGroup = resolveLimitGroup(state, userId)?.group ?? null;
  if (blocked?.kind === "groupLimit") {
    return {
      message: `${blocked.group.name}'s group limit is reached. Usage resets on ${BILLING_CYCLE_RESET_LABEL}.`,
      tone: "warning",
    };
  }
  if (limitGroup && limitGroup.groupLimit !== null) {
    const used = getGroupUsage(state, limitGroup.id);
    const pct = Math.floor((used / limitGroup.groupLimit) * 100);
    if (pct >= 100) {
      return {
        message: `${limitGroup.name}'s group limit is reached. You're using your seat allowance: ${formatCreditAmount(getSeatAllowanceLeft(state, userId, plan))} credits left.`,
        tone: "neutral",
      };
    }
    if (pct >= 80 && blocked === null) {
      return {
        message: `${limitGroup.name} has used ${pct}% of its group limit`,
        tone: "neutral",
      };
    }
  }
  if (blocked?.kind === "memberLimit") {
    return { message: "You've reached your usage limit", tone: "warning" };
  }
  const own = getMemberPoolSpend(state, userId);
  if (own / getPerMemberLimit(state, userId).value >= 0.8) {
    return { message: "You've used 80% of your usage limit", tone: "neutral" };
  }
  return null;
}

export function GroupLimitMemberView({
  state,
  plan,
  userId,
  role,
  onUserChange,
  onRoleChange,
  onStateChange,
  onManageGroupLimits,
}: GroupLimitMemberViewProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const user = getGroupLimitUser(userId);
  const limitGroup = resolveLimitGroup(state, userId)?.group ?? null;
  const blocked = getBlockedReason(state, userId, plan);
  const banner = computeBanner(state, plan, userId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Member view
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              isSelect
              label={`Viewing as ${user.fullName}`}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-96 overflow-y-auto">
            {getMemberIds(state).map((id) => {
              const lg = resolveLimitGroup(state, id);
              return (
                <DropdownMenuItem
                  key={id}
                  label={getGroupLimitUser(id).fullName}
                  description={
                    lg ? `Draws from ${lg.group.name}` : "No limit group"
                  }
                  onClick={() => onUserChange(id)}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <ButtonsSwitchList
          size="xs"
          value={role}
          onValueChange={(value) => onRoleChange(value as MemberViewRole)}
        >
          <ButtonsSwitch value="member" label="Member" />
          <ButtonsSwitch value="admin" label="Admin" />
        </ButtonsSwitchList>
        {limitGroup && limitGroup.groupLimit !== null && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              Simulate {limitGroup.name} usage:
            </span>
            {[0.5, 0.8, 1].map((ratio) => (
              <Button
                key={ratio}
                size="xs"
                variant="ghost"
                label={`${ratio * 100}%`}
                onClick={() =>
                  onStateChange(
                    setGroupUsageForDemo(
                      state,
                      limitGroup.id,
                      Math.round((limitGroup.groupLimit ?? 0) * ratio)
                    )
                  )
                }
              />
            ))}
            <span className="text-xs tabular-nums text-muted-foreground">
              ({formatCreditAmount(getGroupUsage(state, limitGroup.id))} /{" "}
              {formatCreditAmount(limitGroup.groupLimit)})
            </span>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6">
        <div className="flex w-full max-w-3xl flex-1 flex-col justify-end gap-4 py-8">
          <div className="self-end rounded-2xl bg-muted-background px-4 py-3 text-sm text-foreground">
            Can you summarize this week's open support tickets by customer?
          </div>
          <div className="text-sm text-foreground">
            Here is the summary of the 42 open tickets, grouped by customer…
          </div>
        </div>
      </div>
      <div className="flex w-full justify-center px-6 pb-6">
        <div className="flex w-full max-w-3xl flex-col">
          {banner && (
            <div
              className={cn(
                "mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3",
                "border-border bg-background"
              )}
            >
              <span
                className={cn(
                  "copy-sm grow truncate",
                  banner.tone === "warning" ? "text-warning" : "text-foreground"
                )}
              >
                {banner.message}
              </span>
              {role === "admin" && limitGroup && (
                <Button
                  size="xs"
                  variant="outline"
                  label="Manage group limits"
                  onClick={onManageGroupLimits}
                />
              )}
            </div>
          )}
          <InputBar
            placeholder="Ask a question"
            isFloating={false}
            onSend={() => {
              if (blocked) {
                setIsPopupOpen(true);
              }
            }}
          />
        </div>
      </div>
      <Dialog open={isPopupOpen} onOpenChange={setIsPopupOpen}>
        <DialogContent>
          {blocked?.kind === "groupLimit" ? (
            <>
              <DialogHeader>
                <DialogTitle>Group limit reached</DialogTitle>
              </DialogHeader>
              <DialogContainer>
                <Page.P>
                  {role === "admin"
                    ? `${blocked.group.name} has used all of its ${formatCreditAmount(blocked.group.groupLimit ?? 0)} credits for this billing cycle. On the Usage page you can raise its group limit or move members to another limit group.`
                    : `${blocked.group.name} has used all of its credits for this billing cycle, so you can't send messages until it resets on ${BILLING_CYCLE_RESET_LABEL}. Please contact your administrator to raise it.`}
                </Page.P>
              </DialogContainer>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Usage cap reached</DialogTitle>
              </DialogHeader>
              <DialogContainer>
                <Page.P>
                  {role === "admin"
                    ? "You have reached your personal usage cap. On the usage page you can change your seat or adjust user caps."
                    : "You have reached your personal usage cap. Please contact your administrator to increase it."}
                </Page.P>
              </DialogContainer>
            </>
          )}
          {role === "admin" ? (
            <DialogFooter
              leftButtonProps={{ label: "Cancel", variant: "outline" }}
              rightButtonProps={{
                label:
                  blocked?.kind === "groupLimit"
                    ? "Manage group limits"
                    : "Go to Usage",
                variant: "highlight",
                onClick: onManageGroupLimits,
              }}
            />
          ) : (
            <DialogFooter
              rightButtonProps={{ label: "Ok", variant: "highlight" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
