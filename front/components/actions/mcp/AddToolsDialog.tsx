import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { getDefaultRemoteMCPServerByName } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
  withTracking,
} from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionCard,
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Plus,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

interface AddToolCardProps {
  mcpServer: MCPServerType;
  isPending: boolean;
  onClick: () => void;
}

const AddToolCard = ({ mcpServer, isPending, onClick }: AddToolCardProps) => (
  <ActionCard
    icon={getIcon(mcpServer.icon)}
    label={getMcpServerDisplayName(mcpServer)}
    description={mcpServer.description}
    canAdd={false}
    disabled={isPending}
    onClick={onClick}
    cardContainerClassName="h-28"
    descriptionLineClamp={3}
  />
);

interface AddToolsButtonProps {
  onClick: () => void;
  variant?: "primary" | "outline";
}

export const AddToolsButton = ({
  onClick,
  variant = "primary",
}: AddToolsButtonProps) => (
  <Button
    label="Add Tools"
    variant={variant}
    icon={Plus}
    size="sm"
    onClick={withTracking(TRACKING_AREAS.TOOLS, "add_tools_menu", onClick)}
  />
);

interface AddToolsDialogProps {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  enabledMCPServers: MCPServerType[];
  createInternalMCPServer: (mcpServer: MCPServerType) => Promise<void>;
  createRemoteMCPServer: (
    defaultServerConfig?: DefaultRemoteMCPServerConfig
  ) => void;
}

export const AddToolsDialog = ({
  owner,
  isOpen,
  setIsOpen,
  enabledMCPServers,
  createInternalMCPServer,
  createRemoteMCPServer,
}: AddToolsDialogProps) => {
  // Latched on first open: keeps the SWR data mounted while the dialog
  // animates closed, otherwise the grid flashes the empty state.
  const [hasOpened, setHasOpened] = useState(false);
  const [searchText, setSearchText] = useState("");
  // Names of servers whose direct creation is in flight, to disable their
  // card while the request completes.
  const [pendingServerNames, setPendingServerNames] = useState<Set<string>>(
    new Set()
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(false);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setHasOpened(true);
      setSearchText("");
    }
  }

  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
      disabled: !hasOpened,
    });

  // The comparison by names here is safe because names are shared between
  // multiple instances of the same MCP server (sIds are not).
  const enabledServerNames = useMemo(
    () => new Set(enabledMCPServers.map((mcpServer) => mcpServer.name)),
    [enabledMCPServers]
  );

  const filteredMCPServers = useMemo(
    () =>
      availableMCPServers
        .filter(
          (mcpServer) =>
            mcpServer.availability === "manual" &&
            (mcpServer.allowMultipleInstances ||
              !enabledServerNames.has(mcpServer.name)) &&
            filterMCPServer(mcpServer, searchText)
        )
        .sort((a, b) =>
          getMcpServerDisplayName(a).localeCompare(getMcpServerDisplayName(b))
        ),
    [availableMCPServers, enabledServerNames, searchText]
  );

  const onSelectMCPServer = async (mcpServer: MCPServerType) => {
    const remoteMcpServer = getDefaultRemoteMCPServerByName(mcpServer.name);
    if (remoteMcpServer) {
      createRemoteMCPServer(remoteMcpServer);
      return;
    }
    setPendingServerNames((prev) => new Set(prev).add(mcpServer.name));
    await createInternalMCPServer(mcpServer);
    setPendingServerNames((prev) => {
      const next = new Set(prev);
      next.delete(mcpServer.name);
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        size="xl"
        height="xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add tools</DialogTitle>
        </DialogHeader>
        <DialogContainer
          fixedContent={
            <div className="flex flex-row items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                name="search"
                placeholder="Search tools..."
                value={searchText}
                onChange={setSearchText}
                disabled={isAvailableMCPServersLoading}
                className="flex-grow"
              />
              <Button
                icon={Plus}
                label="Add MCP Server"
                variant="outline"
                onClick={withTracking(
                  TRACKING_AREAS.TOOLS,
                  "add_mcp_server",
                  () => createRemoteMCPServer()
                )}
              />
            </div>
          }
        >
          {isAvailableMCPServersLoading && (
            <div className="flex justify-center py-8">
              <Spinner size="sm" />
            </div>
          )}
          {!isAvailableMCPServersLoading &&
            (filteredMCPServers.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-8">
                <div className="px-4 text-center">
                  <div className="mb-2 text-lg font-medium text-foreground">
                    No tool matches your search
                  </div>
                  <div className="max-w-sm text-muted-foreground">
                    No tools found. Try a different search term.
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {filteredMCPServers.map((mcpServer) => (
                  <AddToolCard
                    key={mcpServer.sId}
                    mcpServer={mcpServer}
                    isPending={pendingServerNames.has(mcpServer.name)}
                    onClick={() => {
                      trackEvent({
                        area: TRACKING_AREAS.TOOLS,
                        object: "tool_select",
                        action: TRACKING_ACTIONS.CLICK,
                        extra: {
                          tool_name: mcpServer.name,
                          tool_id: mcpServer.sId,
                          tool_type: getDefaultRemoteMCPServerByName(
                            mcpServer.name
                          )
                            ? "remote"
                            : "internal",
                        },
                      });
                      void onSelectMCPServer(mcpServer);
                    }}
                  />
                ))}
              </div>
            ))}
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
};
