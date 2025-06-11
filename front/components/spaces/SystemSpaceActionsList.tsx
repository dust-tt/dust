import * as React from "react";
import { useState } from "react";

import { AdminActionsList } from "@app/components/actions/mcp/AdminActionsList";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useMCPServerViews } from "@app/lib/swr/mcp_server_views";
import type { LightWorkspaceType, SpaceType } from "@app/types";

interface SpaceActionsListProps {
  isAdmin: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SystemSpaceActionsList = ({
  owner,
  isAdmin,
  space,
}: SpaceActionsListProps) => {
  const [mcpServerToShow, setMcpServerToShow] = useState<MCPServerType | null>(
    null
  );
  const { serverViews } = useMCPServerViews({
    owner,
    space,
  });

  const mcpServerView = serverViews.find(
    (view) => view.server.sId === mcpServerToShow?.sId
  );

  const { q: searchParam } = useQueryParams(["q"]);
  const searchTerm = searchParam.value || "";

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {mcpServerToShow && (
        <MCPServerDetails
          owner={owner}
          mcpServerView={mcpServerView ?? null}
          onClose={() => {
            setMcpServerToShow(null);
          }}
          isOpen={!!mcpServerToShow}
        />
      )}
      <AdminActionsList
        owner={owner}
        filter={searchTerm}
        systemSpace={space}
        setMcpServerToShow={(mcpServer) => {
          setMcpServerToShow(mcpServer);
        }}
      />
    </>
  );
};
