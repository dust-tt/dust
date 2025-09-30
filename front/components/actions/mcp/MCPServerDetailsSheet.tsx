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
  onSave: () => Promise<boolean>;
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

  const changeTab = async (next: TabType) => {
    if (selectedTab === "info" && next !== "info") {
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

  const handleOpenChange = async (open: boolean) => {
    if (open) {
      return;
    }
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
              disabled={form.formState.isSubmitting}
              onClick={() => handleOpenChange(false)}
            />
            <div className="flex-grow" />
            <Button
              label={form.formState.isSubmitting ? "Saving..." : "Save"}
              variant="primary"
              disabled={form.formState.isSubmitting}
              onClick={async () => {
                const ok = await onSave();
                if (ok) {
                  onClose();
                }
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
