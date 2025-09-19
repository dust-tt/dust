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
import { useState } from "react";

import { DeleteMCPServerDialog } from "@app/components/actions/mcp/DeleteMCPServerDialog";
import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { MCPActionHeader } from "@app/components/actions/MCPActionHeader";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
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
                    <div className="flex h-full flex-row items-center">
                      <Button
                        icon={TrashIcon}
                        variant="warning"
                        label="Remove"
                        size="xs"
                        onClick={() => {
                          setMCPServerToDelete(mcpServerView.server);
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
