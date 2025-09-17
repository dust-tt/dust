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
  const [mcpServerToShow, setMcpServerToShow] = useState<MCPServerType | null>(
    null
  );
  const { serverViews } = useMCPServerViews({
    owner,
    space,
  });

  const mcpServerView = useMemo(
    () => serverViews.find((view) => view.server.sId === mcpServerToShow?.sId),
    [serverViews, mcpServerToShow?.sId]
  );

  const { q: searchParam } = useQueryParams(["q"]);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const searchTerm = searchParam.value || "";

  const handleClose = useCallback(() => {
    setMcpServerToShow(null);
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {mcpServerToShow && (
        <MCPServerDetails
          owner={owner}
          mcpServerView={mcpServerView ?? null}
          onClose={handleClose}
          isOpen={!!mcpServerToShow}
        />
      )}
      <AdminActionsList
        owner={owner}
        user={user}
        filter={searchTerm}
        systemSpace={space}
        setMcpServerToShow={setMcpServerToShow}
      />
    </>
  );
};
