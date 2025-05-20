import {
  Button,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useEffect, useState } from "react";

import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { MCPServerDetailsSharing } from "@app/components/actions/mcp/MCPServerDetailsSharing";
import { useMCPConnectionManagement } from "@app/hooks/useMCPConnectionManagement";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useDeleteMCPServer,
  useMCPServer,
  useMCPServerConnections,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

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
    ? getServerTypeAndIdFromSId(mcpServer.sId).serverType
    : "internal";

  const { server: updatedMCPServer } = useMCPServer({
    owner,
    serverId: mcpServer?.sId || "",
    disabled: serverType !== "remote",
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedTab("info");
    }
  }, [isOpen]);

  const effectiveMCPServer = updatedMCPServer || mcpServer;

  const authorization = effectiveMCPServer?.authorization;
  const { deleteServer } = useDeleteMCPServer(owner);
  const [mcpServerToDelete, setMCPServerToDelete] = useState<
    MCPServerType | undefined
  >();

  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    disabled: !authorization,
  });

  const connection = connections.find(
    (c) => c.internalMCPServerId === effectiveMCPServer?.sId
  );

  const [isLoading, setIsLoading] = useState(false);
  const { createAndSaveMCPServerConnection, deleteMCPServerConnection } =
    useMCPConnectionManagement({
      owner,
    });

  return (
    <>
      <Dialog
        open={mcpServerToDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setMCPServerToDelete(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove action</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            Are you sure you want to remove the action "
            {asDisplayName(mcpServerToDelete?.name)}"?
            <div className="mt-2">
              <b>This action cannot be undone.</b>
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              disabled: isLoading,
              variant: "outline",
              onClick: () => setMCPServerToDelete(undefined),
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              disabled: isLoading,
              onClick: async () => {
                if (mcpServerToDelete) {
                  setMCPServerToDelete(undefined);
                  setIsLoading(true);
                  await deleteServer(mcpServerToDelete.sId);
                  setIsLoading(false);
                  onClose();
                }
              },
            }}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent size="lg">
          <SheetHeader className="flex flex-col gap-5 pb-0 text-sm text-foreground dark:text-foreground-night">
            <VisuallyHidden>
              <SheetTitle />
            </VisuallyHidden>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              {effectiveMCPServer && getAvatar(effectiveMCPServer, "md")}
              <div className="flex grow flex-col gap-0 pr-9">
                <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
                  {asDisplayName(effectiveMCPServer?.name)}
                </div>
                <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {effectiveMCPServer?.description}
                </div>
                {authorization && !connection && (
                  <div>
                    <Chip color="warning" size="xs">
                      Requires authentication
                    </Chip>
                  </div>
                )}
              </div>
            </div>

            <div className="flex w-full flex-row justify-end gap-2 pt-2">
              {authorization && !connection && (
                <div>
                  <Button
                    variant="highlight"
                    disabled={isConnectionsLoading}
                    label={"Connect"}
                    size="sm"
                    onClick={() => {
                      void createAndSaveMCPServerConnection({
                        authorizationInfo: authorization,
                        mcpServerId: effectiveMCPServer?.sId,
                      });
                    }}
                  />
                </div>
              )}
              {authorization && connection && (
                <div>
                  <Button
                    variant="outline"
                    disabled={isConnectionsLoading}
                    label={"Disconnect"}
                    size="sm"
                    onClick={() => {
                      void deleteMCPServerConnection({
                        connectionId: connection.sId,
                      });
                    }}
                  />
                </div>
              )}
            </div>

            <Tabs value={selectedTab}>
              <TabsList border={false}>
                <TabsTrigger
                  value="info"
                  label="Info"
                  icon={InformationCircleIcon}
                  onClick={() => setSelectedTab("info")}
                />
                {mcpServer?.availability === "manual" && (
                  <TabsTrigger
                    value="sharing"
                    label="Sharing"
                    icon={LockIcon}
                    onClick={() => setSelectedTab("sharing")}
                  />
                )}

                {effectiveMCPServer &&
                  effectiveMCPServer.availability === "manual" && (
                    <>
                      <div className="grow" />
                      <Button
                        variant="outline"
                        icon={TrashIcon}
                        label={"Remove"}
                        size="sm"
                        onClick={() => {
                          setMCPServerToDelete(effectiveMCPServer);
                        }}
                      />
                    </>
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
    </>
  );
}
