import {
  Button,
  InformationCircleIcon,
  LockIcon,
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
import { useContext, useEffect, useState } from "react";

import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { MCPActionHeader } from "@app/components/actions/MCPActionHeader";
import { ConfirmContext } from "@app/components/Confirm";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useDeleteMCPServer } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

const DETAILS_TABS = ["info", "sharing"];
type TabType = (typeof DETAILS_TABS)[number];

interface MCPServerDetailsProps {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
}

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("info");
  const [isDeleting, setIsDeleting] = useState(false);
  const confirm = useContext(ConfirmContext);
  const { deleteServer } = useDeleteMCPServer(owner);

  useEffect(() => {
    if (mcpServerView) {
      setSelectedTab(DETAILS_TABS[0]);
    }
  }, [mcpServerView]);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent size="lg">
          <SheetHeader className="flex flex-col gap-5 pb-0 text-foreground dark:text-foreground-night">
            <VisuallyHidden>
              <SheetTitle />
            </VisuallyHidden>
            {mcpServerView && <MCPActionHeader mcpServerView={mcpServerView} />}

            <Tabs value={selectedTab}>
              <TabsList border={false}>
                <TabsTrigger
                  value="info"
                  label="Info"
                  icon={InformationCircleIcon}
                  onClick={() => setSelectedTab("info")}
                />
                {mcpServerView?.server.availability === "manual" && (
                  <TabsTrigger
                    value="sharing"
                    label="Sharing"
                    icon={LockIcon}
                    onClick={() => setSelectedTab("sharing")}
                  />
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
                          setIsDeleting(true);
                          const deleted = await deleteServer(server);
                          setIsDeleting(false);
                          if (deleted) {
                            onClose();
                          }
                        }}
                      />
                    </div>
                  </>
                )}
              </TabsList>
            </Tabs>
          </SheetHeader>

          <SheetContainer>
            {mcpServerView && (
              <>
                {selectedTab === "info" && (
                  <MCPServerDetailsInfo
                    mcpServerView={mcpServerView}
                    owner={owner}
                  />
                )}
                {selectedTab === "sharing" && (
                  <MCPServerDetailsSharing
                    mcpServer={mcpServerView.server}
                    owner={owner}
                  />
                )}
              </>
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
