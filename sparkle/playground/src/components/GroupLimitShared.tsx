import {
  ArrowRight,
  Avatar,
  Chip,
  cn,
  ContentMessage,
  Icon,
  ProgressBar,
  RadioGroupCustomItem,
} from "@dust-tt/sparkle";
import type { ComponentProps, ReactNode } from "react";

import {
  formatCreditAmount,
  getGroupLimitUser,
  type MemberChange,
} from "../data/groupLimits";

export function usageBarFillClass(used: number, limit: number) {
  if (limit > 0 && used >= limit) {
    return "bg-warning";
  }
  if (limit > 0 && used / limit >= 0.8) {
    return "bg-golden-500";
  }
  return "bg-highlight";
}

interface UsageBarProps {
  used: number;
  limit: number;
  label: string;
  className?: string;
  size?: "sm" | "md";
}

export function UsageBar({
  used,
  limit,
  label,
  className,
  size = "sm",
}: UsageBarProps) {
  const percentage =
    limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0;
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <div
        className={cn(
          "flex justify-between tabular-nums text-foreground",
          size === "sm" ? "text-xs" : "text-sm"
        )}
      >
        <span>
          {formatCreditAmount(used)} / {formatCreditAmount(limit)}
        </span>
        <span className="text-muted-foreground">{Math.round(percentage)}%</span>
      </div>
      <div className="flex h-3 w-full items-center">
        <ProgressBar
          label={label}
          className={cn("w-full gap-px", size === "sm" ? "h-1" : "h-1.5")}
          variant="transparent"
          values={[
            { value: percentage, className: usageBarFillClass(used, limit) },
            { value: 100 - percentage, className: "bg-muted-background" },
          ]}
        />
      </div>
    </div>
  );
}

export function MemberIdentity({
  userId,
  secondary,
  size = "sm",
}: {
  userId: string;
  secondary?: ReactNode;
  size?: "xs" | "sm";
}) {
  const user = getGroupLimitUser(userId);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar
        visual={user.portrait}
        name={user.fullName}
        size={size}
        isRounded
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {user.fullName}
        </span>
        {secondary && (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{children}</span>
      {trailing && <div className="ml-auto flex gap-1">{trailing}</div>}
    </div>
  );
}

export function LimitGroupSummary({
  name,
  used,
  limit,
  perMemberLabel,
  badge,
}: {
  name: string;
  used: number;
  limit: number | null;
  perMemberLabel: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {badge}
      </div>
      {limit !== null ? (
        <UsageBar used={used} limit={limit} label={`${name} group limit`} />
      ) : (
        <span className="text-xs text-muted-foreground">No group limit</span>
      )}
      <span className="text-xs text-muted-foreground">{perMemberLabel}</span>
    </div>
  );
}

// Lists the members whose limit per member changes, and warns about those the
// change blocks right away.
export function MemberLimitChanges({
  changes,
  title,
}: {
  changes: MemberChange[];
  title?: string;
}) {
  const limitChanges = changes.filter((c) => c.limitBefore !== c.limitAfter);
  const newlyBlocked = changes.filter((c) => c.becomesBlocked);
  if (limitChanges.length === 0 && newlyBlocked.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {limitChanges.length > 0 && (
        <ContentMessage
          size="lg"
          variant="blue"
          title={
            title ??
            `${limitChanges.length} member${limitChanges.length === 1 ? "" : "s"} will get a different limit per member`
          }
        >
          <div className="flex flex-col gap-1.5 pt-1">
            <span>
              A member's limit per member comes from their limit group.
            </span>
            {limitChanges.map((c) => (
              <div key={c.userId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {getGroupLimitUser(c.userId).fullName}
                </span>
                <span className="tabular-nums text-muted-foreground line-through">
                  {formatCreditAmount(c.limitBefore)}
                </span>
                <Icon visual={ArrowRight} size="xs" />
                <span className="font-semibold tabular-nums">
                  {formatCreditAmount(c.limitAfter)}
                </span>
                <span className="text-muted-foreground">credits/month</span>
              </div>
            ))}
          </div>
        </ContentMessage>
      )}
      {newlyBlocked.length > 0 && (
        <ContentMessage
          size="lg"
          variant="warning"
          title={`${newlyBlocked.length} member${newlyBlocked.length === 1 ? "" : "s"} will be blocked right away`}
        >
          {newlyBlocked
            .map((c) => getGroupLimitUser(c.userId).fullName)
            .join(", ")}{" "}
          {newlyBlocked.length === 1 ? "has" : "have"} already used more than
          the limit that will apply.
        </ContentMessage>
      )}
    </div>
  );
}

export function LimitGroupChip({
  name,
  isDefault,
}: {
  name: string;
  isDefault: boolean;
}) {
  return (
    <Chip
      size="mini"
      color="highlight"
      label={isDefault ? `${name} · default` : name}
    />
  );
}

// RadioGroupCustomItem applies `className` to the radio button too, so the card
// styling lives on a wrapper.
export function RadioCard({
  cardClassName,
  ...props
}: ComponentProps<typeof RadioGroupCustomItem> & { cardClassName?: string }) {
  return (
    <div className={cardClassName}>
      <RadioGroupCustomItem {...props} />
    </div>
  );
}
