import { formatCredits, formatFairUseTimeframe } from "@app/lib/client/credits";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
  PlanType,
} from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Attachment01,
  Icon,
  Markdown,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";

// The per-seat fair-use limit that applies to a plan. Credit-priced plans budget
// per-user credits; other (Pro/Enterprise) plans still cap per-seat messages.
export type FairUseSeatLimit =
  | { kind: "credits"; limit: number; timeframe: MaxAwuCreditsTimeframeType }
  | { kind: "messages"; limit: number; timeframe: MaxMessagesTimeframeType };

// Resolve the fair-use limit that applies to a plan, or undefined when none is
// configured (both limits are the -1 unlimited sentinel).
export function fairUseSeatLimitFromPlan(
  plan: PlanType
): FairUseSeatLimit | undefined {
  const {
    maxAwuCredits,
    maxAwuCreditsTimeframe,
    maxMessages,
    maxMessagesTimeframe,
  } = plan.limits.assistant;

  if (maxAwuCredits !== -1) {
    return {
      kind: "credits",
      limit: maxAwuCredits,
      timeframe: maxAwuCreditsTimeframe,
    };
  }
  if (maxMessages !== -1) {
    return {
      kind: "messages",
      limit: maxMessages,
      timeframe: maxMessagesTimeframe,
    };
  }
  return undefined;
}

interface FairUsageModalProps {
  isOpened: boolean;
  onClose: () => void;
  // The fair-use limit for the current plan, when known. Omitted on generic
  // surfaces (e.g. the pricing page) where no single plan is in context.
  seatLimit?: FairUseSeatLimit;
}

function getFairUseContent(seatLimit?: FairUseSeatLimit): string {
  let limitLine: string;
  switch (seatLimit?.kind) {
    case "credits": {
      const timeframeLabel = formatFairUseTimeframe(seatLimit.timeframe);
      limitLine = `On your current plan, that is **${formatCredits(seatLimit.limit)} credits${
        timeframeLabel ? ` ${timeframeLabel}` : ""
      }**.`;
      break;
    }
    case "messages": {
      const timeframeLabel = formatFairUseTimeframe(seatLimit.timeframe);
      limitLine = `On your current plan, that is **${seatLimit.limit} messages${
        timeframeLabel ? ` ${timeframeLabel}` : ""
      }**.`;
      break;
    }
    case undefined:
      limitLine = `The exact limit depends on your plan.`;
      break;
    default:
      assertNeverAndIgnore(seatLimit);
      limitLine = `The exact limit depends on your plan.`;
  }

  return `
# **Fair use principles for user seats**

Each user seat at Dust is tied to a specific human user, and is destined to be used by that person only, for the purposes of typing and sending messages manually (as opposed to using programmatic methods such as scripts, API calls, etc. which is covered separately).

To prevent abuse, a "fair use" limit applies to each user seat. ${limitLine}

This limit should be understood as a way to prevent abuse, not as an allowed quota. In particular, it is considered unfair to share a single seat between multiple people.

___
# **Can messages be sent programmatically with Dust?**

Yes, and this usage is encouraged. However, such messages are not covered by individual user seats and fair use limits, and are billed separately.

Dust plans already include monthly credits for programmatic usage, and more credits can be purchased if needed, see [Programmatic usage at Dust](https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e).

`;
}

export function FairUsageModal({
  isOpened,
  onClose,
  seatLimit,
}: FairUsageModalProps) {
  return (
    <Sheet
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Dust's Fair Use Policy</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <Icon visual={Attachment01} size="lg" className="text-success-500" />
          <Markdown
            content={getFairUseContent(seatLimit)}
            forcedTextSize="text-sm"
          />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
