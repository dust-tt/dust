import {
  Avatar,
  classNames,
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
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import React, { useEffect, useState } from "react";

import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { useMCPServer } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

type MCPServerDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServer: MCPServerType | null;
  isOpen: boolean;
};

export function MCPServerDetails({
  owner,
  mcpServer,
  isOpen,
  onClose,
}: MCPServerDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<string>("info");

  const serverType = mcpServer
    ? getServerTypeAndIdFromSId(mcpServer.id).serverType
    : "internal";

  const { server: updatedMCPServer } = useMCPServer({
    owner,
    serverId: mcpServer?.id || "",
    disabled: serverType !== "remote",
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedTab("info");
    }
  }, [isOpen]);

  const effectiveMCPServer = updatedMCPServer || mcpServer;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg">
        <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
          <VisuallyHidden>
            <SheetTitle />
          </VisuallyHidden>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Avatar
              visual={React.createElement(
                MCP_SERVER_ICONS[mcpServer?.icon || DEFAULT_MCP_SERVER_ICON]
              )}
            />
            <div className="flex grow flex-col gap-1">
              <div
                className={classNames(
                  "text-foreground dark:text-foreground-night",
                  effectiveMCPServer?.name &&
                    effectiveMCPServer.name.length > 20
                    ? "heading-md"
                    : "heading-lg"
                )}
              >
                {effectiveMCPServer?.name}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {effectiveMCPServer?.description}
              </div>
            </div>
          </div>

          <Tabs value={selectedTab}>
            <TabsList border={false}>
              <TabsTrigger
                value="info"
                label="Info"
                icon={InformationCircleIcon}
                onClick={() => setSelectedTab("info")}
              />
              {!mcpServer?.isDefault && (
                <TabsTrigger
                  value="sharing"
                  label="Sharing"
                  icon={LockIcon}
                  onClick={() => setSelectedTab("sharing")}
                />
              )}
            </TabsList>
          </Tabs>
        </SheetHeader>

        <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
          {effectiveMCPServer && (
            <>
              {selectedTab === "info" && (
                <MCPServerDetailsInfo
                  mcpServer={effectiveMCPServer}
                  owner={owner}
                />
              )}
              {selectedTab === "sharing" && (
                <MCPServerDetailsSharing
                  mcpServer={effectiveMCPServer}
                  owner={owner}
                />
              )}
            </>
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
