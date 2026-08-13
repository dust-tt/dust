import { AdminActionsList } from "@app/components/actions/mcp/AdminActionsList";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { SpaceSearchContext } from "@app/components/spaces/search/SpaceSearchContext";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, UserType } from "@app/types/user";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import * as React from "react";
import { useCallback, useContext, useMemo, useState } from "react";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  user: UserType;
  space: SpaceType;
}

export const SystemSpaceActionsList = ({
  owner,
  user,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  // Keep selected server separate from open state so content
  // remains mounted during close animations (Radix best practice).
  const [selectedMcpServer, setSelectedMcpServer] =
    useState<MCPServerType | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { mcpServers } = useMCPServers({ owner });

  const mcpServerView = useMemo(() => {
    const server = mcpServers.find((s) => s.sId === selectedMcpServer?.sId);
    const view = server?.views.find((v) => v.spaceId === space.sId);
    if (!server || !view) {
      return null;
    }

    return { ...view, server: { ...view.server, tools: server.tools } };
  }, [mcpServers, selectedMcpServer?.sId, space.sId]);

  const { frontendListFilterQuery } = useContext(SpaceSearchContext);
  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = frontendListFilterQuery ?? searchParam.value ?? "";

  const handleClose = useCallback(() => {
    // Close the sheet but keep content mounted to avoid glitches.
    setIsDetailsOpen(false);
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <MCPServerDetails
        owner={owner}
        mcpServerView={mcpServerView}
        onClose={handleClose}
        isOpen={isDetailsOpen}
      />
      <AdminActionsList
        owner={owner}
        user={user}
        filter={searchTerm}
        systemSpace={space}
        setMcpServerToShow={(server) => {
          setSelectedMcpServer(server);
          setIsDetailsOpen(true);
        }}
      />
    </>
  );
};
