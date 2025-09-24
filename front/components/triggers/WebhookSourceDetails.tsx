import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  LockIcon,
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
import { WebhookSourceDetailsSharing } from "@app/components/triggers/WebhookSourceDetailsSharing";
import type { LightWorkspaceType, RequireAtLeastOne } from "@app/types";
import type { WebhookSourceWithSystemView } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsProps = {
  owner: LightWorkspaceType;
  onClose: () => void;
  webhookSource: RequireAtLeastOne<WebhookSourceWithSystemView, "systemView">;
  isOpen: boolean;
};

export function WebhookSourceDetails({
  owner,
  webhookSource,
  isOpen,
  onClose,
}: WebhookSourceDetailsProps) {
  const systemView = webhookSource.systemView!; // guaranteed by RequireAtLeastOne
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
        webhookSource={webhookSource}
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
            <WebhookSourceDetailsHeader webhookSourceView={systemView} />

            <Tabs value={selectedTab}>
              <TabsList border={false}>
                <TabsTrigger
                  value="info"
                  label="Info"
                  icon={InformationCircleIcon}
                  onClick={() => setSelectedTab("info")}
                />
                <TabsTrigger
                  value="sharing"
                  label="Sharing"
                  icon={LockIcon}
                  onClick={() => setSelectedTab("sharing")}
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

          <SheetContainer className="pb-4">
            {selectedTab === "info" && (
              <WebhookSourceDetailsInfo
                webhookSourceView={systemView}
                owner={owner}
              />
            )}
            {selectedTab === "sharing" && (
              <WebhookSourceDetailsSharing
                webhookSource={webhookSource}
                owner={owner}
              />
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
