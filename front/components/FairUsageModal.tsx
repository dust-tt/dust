import { AttachmentIcon, Icon, Markdown, Modal } from "@dust-tt/sparkle";

interface FairUsageModalProps {
  isOpened: boolean;
  onClose: () => void;
}

const FAIR_USE_CONTENT = `
# Fair use principles
**Dust Pro** is designed company setting and team use
of AI. It is not designed as a model wrapper for programatic usage.

**Dust Enterprise** provides programatic usage (though
API), with custom prices.
___
# What is "unfair" usage?
Is considered *"Unfair"* usage:
- Sharing single seat between multiple people.
- Using Dust programmatically at a large scale on a Pro plan.
___
# "Fair use" limitations
For **Pro plans**, a limit at 100 messages / seat / day (Enough to cover any fair usage) is in place and apply to programatic (API) use as well.
`;

export function FairUsageModal({ isOpened, onClose }: FairUsageModalProps) {
  return (
    <Modal
      isOpen={isOpened}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
      title="Dust's Fair Use Policy"
    >
      <div className="py-8">
        <Icon visual={AttachmentIcon} size="lg" className="text-emerald-500" />
        <Markdown content={FAIR_USE_CONTENT} size="sm" />
      </div>
    </Modal>
  );
}
