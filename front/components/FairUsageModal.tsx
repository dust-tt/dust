import {
  AttachmentIcon,
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
}

const FAIR_USE_CONTENT = `
# **Fair use principles for user seats**

Each user seat at Dust is tied to a specific human user, and is destined to be used by that person only, for the purposes of typing and sending messages manually (as opposed to using programmatic methods such as scripts, API calls, etc. which is covered separately).

"Fair use" limits apply to each user seat, as follows:
- For **Pro plans**, a limit at 100 messages / seat / day is applied.
- For **Enterprise plans**, a limit at 200 messages / seat / day is applied.

These limits should be understood as a way to prevent abuse, not as an allowed quota of messages. In particular, it is considered unfair to share a single seat between multiple people.

___
# **Can messages be sent programmatically with Dust?**

Yes, and this usage is encouraged. However, such messages are not covered by individual user seats and fair use limits, and are billed separately. 

Dust plans already include monthly credits for programmatic usage, and more credits can be purchased if needed, see [Programmatic usage at Dust](https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e).

`;

export function FairUsageModal({ isOpened, onClose }: FairUsageModalProps) {
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
          <Icon
            visual={AttachmentIcon}
            size="lg"
            className="text-success-500"
          />
          <Markdown content={FAIR_USE_CONTENT} forcedTextSize="text-sm" />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
