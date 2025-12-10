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
# Fair use principles

"Fair use" applies to messages typed and sent by human users, without using programmatic methods (scripts, API calls, etc.).
___
## **"Fair use" limitations**

- For **Pro plans**, a limit at 100 messages / seat / day (Enough to cover any fair usage) is applied.
- For **Enterprise plans**, a limit at 200 messages / seat / day (Enough to cover any fair usage) is applied.
___
## **What is "unfair" usage?**

The following usage is considered *"Unfair"*:
- sharing a single seat between multiple people;
- sending messages programmatically using a regular user seat.
___
## **Can messages be sent programmatically with Dust?**

Yes. Such messages are not covered by fair use limits, and are billed separately.

Check out [Programmatic usage](https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e) documentation for more information


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
