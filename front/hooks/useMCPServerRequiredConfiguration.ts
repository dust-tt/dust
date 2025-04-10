import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { useEffect, useState } from "react";

import { findPathsToConfiguration } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";

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
  const [requiredStrings, setRequiredStrings] = useState<
    Record<string, string>
  >({});
  const [requiredNumbers, setRequiredNumbers] = useState<
    Record<string, number>
  >({});
  const [requiredBooleans, setRequiredBooleans] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!mcpServerView) {
      return;
    }
    const { server } = mcpServerView;
    setRequiresDataSourceConfiguration(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE,
      }).length > 0
    );
    setRequiresTableConfiguration(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.TABLE,
      }).length > 0
    );
    setRequiresChildAgentConfiguration(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT,
      }).length > 0
    );
    setRequiredStrings(
      Object.fromEntries(
        findPathsToConfiguration({
          mcpServer: server,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.STRING,
        }).map((path) => [path, ""])
      )
    );
    setRequiredNumbers(
      Object.fromEntries(
        findPathsToConfiguration({
          mcpServer: server,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER,
        }).map((path) => [path, 0])
      )
    );
    setRequiredBooleans(
      Object.fromEntries(
        findPathsToConfiguration({
          mcpServer: server,
          mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN,
        }).map((path) => [path, false])
      )
    );
  }, [mcpServerView]);

  return {
    requiresDataSourceConfiguration,
    requiresTableConfiguration,
    requiresChildAgentConfiguration,
    requiredStrings,
    requiredNumbers,
    requiredBooleans,
  };
};
