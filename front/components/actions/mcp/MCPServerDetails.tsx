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

import { DeleteMCPServerDialog } from "@app/components/actions/mcp/DeleteMCPServerDialog";
import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { MCPActionHeader } from "@app/components/actions/MCPActionHeader";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import type { WorkspaceType } from "@app/types";

type MCPServerDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServerView: MCPServerViewType | null;
  isOpen: boolean;
};

export function MCPServerDetails({
  owner,
  mcpServerView,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<string>("info");

  useEffect(() => {
    if (isOpen) {
      setSelectedTab("info");
    }
  }, [isOpen]);

  const [mcpServerToDelete, setMCPServerToDelete] = useState<
    MCPServerType | undefined
  >();

  return (
    <>
      {mcpServerToDelete && (
        <DeleteMCPServerDialog
          owner={owner}
          mcpServer={mcpServerToDelete}
          isOpen={mcpServerToDelete !== undefined}
          onClose={(deleted) => {
            setMCPServerToDelete(undefined);
            if (deleted) {
              onClose();
            }
          }}
        />
      )}

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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button icon={MoreIcon} variant="outline" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          key="remove-mcp-server"
                          icon={TrashIcon}
                          label="Remove"
                          variant="warning"
                          onClick={() => {
                            setMCPServerToDelete(mcpServerView.server);
                          }}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
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
