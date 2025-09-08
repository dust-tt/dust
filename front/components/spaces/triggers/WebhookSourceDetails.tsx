import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { WorkspaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  webhookSource: WebhookSourceType;
  isOpen: boolean;
};

export function WebhookSourceDetails({
  owner,
  webhookSource,
  isOpen,
  onClose,
}: WebhookSourceDetailsProps) {
  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent size="lg">
          <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
            <VisuallyHidden>
              <SheetTitle />
            </VisuallyHidden>
            {webhookSource.name}
          </SheetHeader>

          <SheetContainer>
            <div className="flex flex-col gap-2">
              <span>
                Name: <span>{webhookSource.name}</span>
              </span>
              <span>
                Secret: <span>{webhookSource.secret}</span>
              </span>
              <span>
                Signature Header: <span>{webhookSource.signatureHeader}</span>
              </span>
              <span>
                Signature Algorithm:{" "}
                <span>{webhookSource.signatureAlgorithm}</span>
              </span>
              {webhookSource.customHeaders && (
                <span>
                  Custom Headers:{" "}
                  <span>
                    {Object.entries(webhookSource.customHeaders).map(
                      ([key, value]) => (
                        <div key={key}>
                          <span>
                            {key}: {value}
                          </span>
                        </div>
                      )
                    )}
                  </span>
                </span>
              )}
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
