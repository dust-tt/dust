import * as React from "react";
import { useCallback, useMemo, useState } from "react";

import { AdminActionsList } from "@app/components/actions/mcp/AdminActionsList";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType, UserType } from "@app/types";

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
  const { serverViews } = useMCPServerViews({
    owner,
    space,
  });

  const mcpServerView = useMemo(
    () =>
      serverViews.find((view) => view.server.sId === selectedMcpServer?.sId) ??
      null,
    [serverViews, selectedMcpServer?.sId]
  );

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value ?? "";

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
