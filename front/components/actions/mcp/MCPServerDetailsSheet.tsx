import {
  Button,
  InformationCircleIcon,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
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

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
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
import type { SpaceType, WorkspaceType } from "@app/types";

const DETAILS_TABS = ["info", "sharing"] as const;
export type TabType = (typeof DETAILS_TABS)[number];

interface MCPServerDetailsSheetProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
  onSave: () => Promise<boolean>;
  onCancel: () => void;
  spaces: SpaceType[];
}

export function MCPServerDetailsSheet({
  owner,
  mcpServerView,
  isOpen,
  onClose,
  onSave,
  onCancel,
  spaces,
}: MCPServerDetailsSheetProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("info");
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = useContext(ConfirmContext);
  const { deleteServer, isDeleting } = useDeleteMCPServer(owner);

  const form = useFormContext<MCPServerFormValues>();

  useEffect(() => {
    // Only reset to info tab when modal transitions from closed to open.
    if (isOpen && !prevIsOpen) {
      setSelectedTab("info");
    }
    setPrevIsOpen(isOpen);
  }, [isOpen, prevIsOpen]);

  const changeTab = async (next: TabType) => {
    // Since we now have a unified form, we can switch tabs freely
    // without worrying about losing changes.
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

  const handleOpenChange = async (open: boolean) => {
    if (open) {
      return;
    }

    const hasUnsavedChanges = form.formState.isDirty;

    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: "Unsaved changes will be lost",
        message:
          "All unsaved changes will be lost. Are you sure you want to close?",
        validateLabel: "Close without saving",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
    }

    onCancel();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => void handleOpenChange(open)}>
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
                  spaces={spaces}
                />
              </TabsContent>
            </div>
          </Tabs>
        </SheetContainer>
        <div className="mt-2">
          <div className="flex flex-row gap-2 border-t border-border px-3 py-3 dark:border-border-night">
            <Button
              label="Cancel"
              variant="outline"
              disabled={isSaving || form.formState.isSubmitting}
              onClick={() => handleOpenChange(false)}
            />
            <div className="flex-grow" />
            <Button
              label={
                isSaving || form.formState.isSubmitting ? "Saving..." : "Save"
              }
              variant="primary"
              disabled={isSaving || form.formState.isSubmitting}
              onClick={async () => {
                setIsSaving(true);
                try {
                  await onSave();
                } finally {
                  setIsSaving(false);
                }
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
