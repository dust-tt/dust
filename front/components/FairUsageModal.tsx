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
**Dust Pro** is designed company setting and team use
of AI. It is not designed as a model wrapper for programmatic usage.

**Dust Enterprise** provides programmatic usage (though
API), with custom prices.
___
# What is "unfair" usage?
Is considered *"Unfair"* usage:
- Sharing single seat between multiple people.
- Using Dust programmatically at a large scale on a Pro plan.
___
# "Fair use" limitations
For **Pro plans**, a limit at 100 messages / seat / day (Enough to cover any fair usage) is in place and apply to programmatic (API) use as well.
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
