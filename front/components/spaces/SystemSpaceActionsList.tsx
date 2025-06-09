import * as React from "react";
import { useState } from "react";

import { AdminActionsList } from "@app/components/actions/mcp/AdminActionsList";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { MCPServerType } from "@app/lib/api/mcp";
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
          mcpServer={mcpServerToShow}
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
