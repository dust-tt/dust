import { formatCredits, formatCreditsTimeframe } from "@app/lib/client/credits";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
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

interface FairUsageModalProps {
  isOpened: boolean;
  onClose: () => void;
  // When known, the fair-use credit limit and its recurring timeframe for the
  // current plan are rendered in the policy. Omitted on generic surfaces (e.g.
  // the pricing page) where no single plan is in context.
  creditLimit?: number;
  creditLimitTimeframe?: MaxAwuCreditsTimeframeType;
}

function getFairUseContent(
  creditLimit?: number,
  creditLimitTimeframe?: MaxAwuCreditsTimeframeType
): string {
  const hasDynamicLimit =
    creditLimit !== undefined &&
    creditLimit > 0 &&
    creditLimitTimeframe !== undefined;

  const limitLine = hasDynamicLimit
    ? (() => {
        const timeframeLabel = formatCreditsTimeframe(creditLimitTimeframe);
        return `On your current plan, a limit of **${formatCredits(creditLimit)} credits${
          timeframeLabel ? ` ${timeframeLabel}` : ""
        }** applies to each user seat.`;
      })()
    : `The credit limit that applies to each user seat depends on your plan.`;

  return `
# **Fair use principles for user seats**

Each user seat at Dust is tied to a specific human user, and is destined to be used by that person only, for the purposes of typing and sending messages manually (as opposed to using programmatic methods such as scripts, API calls, etc. which is covered separately).

To prevent abuse, a "fair use" limit on credit consumption applies to each user seat. ${limitLine}

This limit should be understood as a way to prevent abuse, not as an allowed quota of credits. In particular, it is considered unfair to share a single seat between multiple people.

___
# **Can messages be sent programmatically with Dust?**

Yes, and this usage is encouraged. However, such messages are not covered by individual user seats and fair use limits, and are billed separately.

Dust plans already include monthly credits for programmatic usage, and more credits can be purchased if needed, see [Programmatic usage at Dust](https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e).

`;
}

export function FairUsageModal({
  isOpened,
  onClose,
  creditLimit,
  creditLimitTimeframe,
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
            content={getFairUseContent(creditLimit, creditLimitTimeframe)}
            forcedTextSize="text-sm"
          />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
