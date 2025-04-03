import {
  Avatar,
  classNames,
  CloudArrowDownIcon,
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
import React, { useState } from "react";

import {
  MCPServerDetailsConnection,
  MCPServerDetailsInfo,
} from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { WorkspaceType } from "@app/types";

type ActionDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mcpServer: MCPServerType | null;
};

export function InternalMCPServerDetails({
  owner,
  mcpServer,
  onClose,
}: ActionDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<string>("info");

  return (
    <Sheet open={!!mcpServer} onOpenChange={onClose}>
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
                  mcpServer?.name && mcpServer.name.length > 20
                    ? "heading-md"
                    : "heading-lg"
                )}
              >
                {mcpServer?.name}
              </div>
              <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {mcpServer?.description}
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
              <TabsTrigger
                value="sharing"
                label="Sharing"
                icon={LockIcon}
                onClick={() => setSelectedTab("sharing")}
              />
            </TabsList>
          </Tabs>
        </SheetHeader>

        <SheetContainer className="flex flex-col gap-5 pt-6 text-sm text-foreground dark:text-foreground-night">
          {mcpServer && (
            <>
              {selectedTab === "info" && (
                <MCPServerDetailsInfo mcpServer={mcpServer} owner={owner} />
              )}
              {selectedTab === "sharing" && (
                <MCPServerDetailsSharing mcpServer={mcpServer} owner={owner} />
              )}
            </>
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
