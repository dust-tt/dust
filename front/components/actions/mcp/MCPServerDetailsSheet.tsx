import {
  Button,
  InformationCircleIcon,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useContext, useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { ConfirmContext } from "@app/components/Confirm";
import {
  getMcpServerDisplayName,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useDeleteMCPServer } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

const DETAILS_TABS = ["info", "sharing"] as const;
type TabType = (typeof DETAILS_TABS)[number];

interface MCPServerDetailsSheetProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function MCPServerDetailsSheet({
  owner,
  mcpServerView,
  isOpen,
  onClose,
  onSave,
  onCancel,
}: MCPServerDetailsSheetProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("info");

  const confirm = useContext(ConfirmContext);
  const { deleteServer, isDeleting } = useDeleteMCPServer(owner);

  const form = useFormContext<InfoFormValues>();

  useEffect(() => {
    if (mcpServerView) {
      setSelectedTab("info");
    }
  }, [mcpServerView]);

  const handleClose = async (open: boolean) => {
    if (!open) {
      if (form.formState.isDirty) {
        const confirmed = await confirm({
          title: "Unsaved changes",
          message:
            "You have unsaved changes. Are you sure you want to close without saving?",
          validateLabel: "Discard changes",
          validateVariant: "warning",
        });
        if (!confirmed) {
          return;
        }
        onCancel();
      }
      onClose();
    }
  };

  const changeTab = async (next: TabType) => {
    if (selectedTab === "info" && next !== "info" && form.formState.isDirty) {
      const confirmed = await confirm({
        title: "Unsaved changes",
        message:
          "You have unsaved changes. Are you sure you want to switch tabs without saving?",
        validateLabel: "Discard changes",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
    }
    setSelectedTab(next);
  };

  const header = useMemo(() => {
    if (!mcpServerView) {
      return null;
    }
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {getAvatar(mcpServerView.server, "md")}
        </div>
        <div>
          <SheetTitle>{getMcpServerViewDisplayName(mcpServerView)}</SheetTitle>
          <SheetDescription>
            {getMcpServerViewDescription(mcpServerView)}
          </SheetDescription>
        </div>
      </div>
    );
  }, [mcpServerView]);

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 text-foreground dark:text-foreground-night">
          {header}
        </SheetHeader>
        <SheetContainer>
          <Tabs
            value={selectedTab}
            onValueChange={(v) => void changeTab(v as TabType)}
          >
            <TabsList>
              <TabsTrigger
                value="info"
                label="Info"
                icon={InformationCircleIcon}
              />
              {mcpServerView?.server.availability === "manual" && (
                <TabsTrigger value="sharing" label="Sharing" icon={LockIcon} />
              )}
              {mcpServerView?.server.availability === "manual" && (
                <>
                  <div className="grow" />
                  <div className="flex h-full flex-row items-center">
                    <Button
                      icon={TrashIcon}
                      variant="warning"
                      label={isDeleting ? "Removing..." : "Remove"}
                      size="xs"
                      disabled={isDeleting}
                      onClick={async () => {
                        if (!mcpServerView) {
                          return;
                        }
                        const server = mcpServerView.server;
                        const confirmed = await confirm({
                          title: "Confirm Removal",
                          message: (
                            <div>
                              Are you sure you want to remove {""}
                              <span className="font-semibold">
                                {getMcpServerDisplayName(server)}
                              </span>
                              ?
                              <div className="mt-2 font-semibold">
                                This action cannot be undone.
                              </div>
                            </div>
                          ),
                          validateLabel: "Remove",
                          validateVariant: "warning",
                        });
                        if (!confirmed) {
                          return;
                        }
                        const deleted = await deleteServer(server);
                        if (deleted) {
                          onClose();
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </TabsList>
            <div className="mt-4">
              <TabsContent value="info">
                {mcpServerView && (
                  <div className="flex flex-col gap-4">
                    <MCPServerDetailsInfo
                      mcpServerView={mcpServerView}
                      owner={owner}
                    />
                  </div>
                )}
              </TabsContent>
              <TabsContent value="sharing">
                <MCPServerDetailsSharing
                  mcpServer={mcpServerView?.server}
                  owner={owner}
                />
              </TabsContent>
            </div>
          </Tabs>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: form.formState.isSubmitting,
          }}
          rightButtonProps={{
            label: form.formState.isSubmitting ? "Saving..." : "Save",
            variant: "primary",
            onClick: onSave,
            disabled: !form.formState.isDirty || form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
