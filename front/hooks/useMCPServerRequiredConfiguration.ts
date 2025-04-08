import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { useEffect, useState } from "react";

import { serverRequiresInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/actions/mcp_metadata";

export const useMCPServerRequiredConfiguration = ({
  mcpServerView,
}: {
  mcpServerView: MCPServerViewType | null;
}) => {
  const [requiresDataSourceConfiguration, setRequiresDataSourceConfiguration] =
    useState<boolean>(false);
  const [requiresTableConfiguration, setRequiresTableConfiguration] =
    useState<boolean>(false);
  const [requiresChildAgentConfiguration, setRequiresChildAgentConfiguration] =
    useState<boolean>(false);

  useEffect(() => {
    if (!mcpServerView) {
      return;
    }
    const { server } = mcpServerView;
    setRequiresDataSourceConfiguration(
      serverRequiresInternalConfiguration({
        serverMetadata: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE,
      })
    );
    setRequiresTableConfiguration(
      serverRequiresInternalConfiguration({
        serverMetadata: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.TABLE,
      })
    );
    setRequiresChildAgentConfiguration(
      serverRequiresInternalConfiguration({
        serverMetadata: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT,
      })
    );
  }, [mcpServerView]);

  return {
    requiresDataSourceConfiguration,
    requiresTableConfiguration,
    requiresChildAgentConfiguration,
  };
};
