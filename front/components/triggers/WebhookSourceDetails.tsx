import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  MoreIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useEffect, useState } from "react";

import { DeleteWebhookSourceDialog } from "@app/components/triggers/DeleteWebhookSourceDialog";
import { WebhookSourceDetailsHeader } from "@app/components/triggers/WebhookSourceDetailsHeader";
import { WebhookSourceDetailsInfo } from "@app/components/triggers/WebhookSourceDetailsInfo";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsProps = {
  owner: LightWorkspaceType;
  onClose: () => void;
  webhookSourceView: WebhookSourceViewType;
  isOpen: boolean;
};

export function WebhookSourceDetails({
  owner,
  webhookSourceView,
  isOpen,
  onClose,
}: WebhookSourceDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<string>("info");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedTab("info");
    }
  }, [isOpen]);

  return (
    <>
      <DeleteWebhookSourceDialog
        owner={owner}
        webhookSource={webhookSourceView.webhookSource}
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          onClose();
        }}
      />
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent size="lg">
          <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
            <VisuallyHidden>
              <SheetTitle />
            </VisuallyHidden>
            <WebhookSourceDetailsHeader webhookSourceView={webhookSourceView} />

            <Tabs value={selectedTab}>
              <TabsList border={false}>
                <TabsTrigger
                  value="info"
                  label="Info"
                  icon={InformationCircleIcon}
                  onClick={() => setSelectedTab("info")}
                />
                <>
                  <div className="grow" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button icon={MoreIcon} variant="outline" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        key="remove-webhook-source"
                        icon={TrashIcon}
                        label="Remove"
                        variant="warning"
                        onClick={() => {
                          setIsDeleteDialogOpen(true);
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              </TabsList>
            </Tabs>
          </SheetHeader>

          <SheetContainer>
            {selectedTab === "info" && (
              <WebhookSourceDetailsInfo
                webhookSourceView={webhookSourceView}
                owner={owner}
              />
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
