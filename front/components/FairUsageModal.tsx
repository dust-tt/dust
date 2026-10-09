import { formatCredits, roundCredits } from "@app/lib/client/credits";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

type Translate = (descriptor: MessageDescriptor) => string;

const PROGRAMMATIC_USAGE_URL =
  "https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e";

// The per-seat fair-use limit for a plan: if the plan sets maxAwuCredits it's a
// credit limit, otherwise it's a max number of messages.
type FairUseSeatLimit =
  | { kind: "credits"; limit: number; timeframe: MaxAwuCreditsTimeframeType }
  | { kind: "messages"; limit: number; timeframe: MaxMessagesTimeframeType };

// If the plan has maxAwuCredits, it's an AWU credit limit; otherwise it's a max
// number of messages. Undefined when neither is set (both are the -1 sentinel).
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

function getCreditsLimitLine(
  limit: number,
  timeframe: MaxAwuCreditsTimeframeType,
  t: Translate
): string {
  const credits = formatCredits(limit);
  const displayedLimit = roundCredits(limit);
  switch (timeframe) {
    case "day":
      return t(
        msg`On your current plan, that is **${plural(displayedLimit, {
          one: `${credits} credit per day`,
          other: `${credits} credits per day`,
        })}**.`
      );
    case "week":
      return t(
        msg`On your current plan, that is **${plural(displayedLimit, {
          one: `${credits} credit per week`,
          other: `${credits} credits per week`,
        })}**.`
      );
    case "month":
      return t(
        msg`On your current plan, that is **${plural(displayedLimit, {
          one: `${credits} credit per month`,
          other: `${credits} credits per month`,
        })}**.`
      );
    case "lifetime":
      return t(
        msg`On your current plan, that is **${plural(displayedLimit, {
          one: `${credits} credit`,
          other: `${credits} credits`,
        })}**.`
      );
    default:
      assertNeverAndIgnore(timeframe);
      return t(
        msg`On your current plan, that is **${plural(displayedLimit, {
          one: `${credits} credit`,
          other: `${credits} credits`,
        })}**.`
      );
  }
}

function getMessagesLimitLine(
  messages: number,
  timeframe: MaxMessagesTimeframeType,
  t: Translate
): string {
  switch (timeframe) {
    case "day":
      return t(
        msg`On your current plan, that is **${plural(messages, {
          one: "# message per day",
          other: "# messages per day",
        })}**.`
      );
    case "lifetime":
      return t(
        msg`On your current plan, that is **${plural(messages, {
          one: "# message",
          other: "# messages",
        })}**.`
      );
    default:
      assertNeverAndIgnore(timeframe);
      return t(
        msg`On your current plan, that is **${plural(messages, {
          one: "# message",
          other: "# messages",
        })}**.`
      );
  }
}

function getFairUseContent(t: Translate, seatLimit?: FairUseSeatLimit): string {
  let limitLine: string;
  switch (seatLimit?.kind) {
    case "credits":
      limitLine = getCreditsLimitLine(seatLimit.limit, seatLimit.timeframe, t);
      break;
    case "messages":
      limitLine = getMessagesLimitLine(seatLimit.limit, seatLimit.timeframe, t);
      break;
    case undefined:
      limitLine = t(msg`The exact limit depends on your plan.`);
      break;
    default:
      assertNeverAndIgnore(seatLimit);
      limitLine = t(msg`The exact limit depends on your plan.`);
  }

  return `
# **${t(msg`Fair use principles for user seats`)}**

${t(msg`Each user seat at Dust is tied to a specific human user, and is destined to be used by that person only, for the purposes of typing and sending messages manually (as opposed to using programmatic methods such as scripts, API calls, etc. which is covered separately).`)}

${t(msg`To prevent abuse, a "fair use" limit applies to each user seat.`)} ${limitLine}

${t(msg`This limit should be understood as a way to prevent abuse, not as an allowed quota.`)} ${t(msg`In particular, it is considered unfair to share a single seat between multiple people.`)}

___
# **${t(msg`Can messages be sent programmatically with Dust?`)}**

${t(msg`Yes, and this usage is encouraged.`)} ${t(msg`However, such messages are not covered by individual user seats and fair use limits, and are billed separately.`)}

${t(msg`Dust plans already include monthly credits for programmatic usage, and more credits can be purchased if needed, see [Programmatic usage at Dust](${PROGRAMMATIC_USAGE_URL}).`)}

`;
}

export function FairUsageModal({
  isOpened,
  onClose,
  seatLimit,
}: FairUsageModalProps) {
  const { t } = useLingui();
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
          <SheetTitle>
            <Trans>Dust's fair use policy</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <Icon visual={Attachment01} size="lg" className="text-success-500" />
          <Markdown
            content={getFairUseContent(t, seatLimit)}
            forcedTextSize="text-sm"
          />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
