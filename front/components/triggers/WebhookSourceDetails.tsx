import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { WebhookSourceDetailsHeader } from "@app/components/triggers/WebhookSourceDetailsHeader";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsProps = {
  onClose: () => void;
  webhookSourceView: WebhookSourceViewType;
  isOpen: boolean;
};

export function WebhookSourceDetails({
  webhookSourceView,
  isOpen,
  onClose,
}: WebhookSourceDetailsProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
          <VisuallyHidden>
            <SheetTitle />
          </VisuallyHidden>
          <WebhookSourceDetailsHeader webhookSourceView={webhookSourceView} />
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
