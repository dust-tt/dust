/**
 * Tool directive card component.
 *
 * Renders a card for tool directives in markdown content.
 * Displays tool information with logo, description, and action buttons.
 */

import { Button, ContentMessage } from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { CreateMCPServerDialog } from "@app/components/actions/mcp/CreateMCPServerSheet";
import { getIcon } from "@app/components/resources/resources_icons";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  useAddMCPServerToSpace,
  useAvailableMCPServers,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpaces, useSpacesAsAdmin } from "@app/lib/swr/spaces";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import type { WorkspaceType } from "@app/types";
import { asDisplayToolName } from "@app/types";

interface ToolSetupCardProps {
  toolName: string;
  toolId: InternalMCPServerNameType;
  owner: WorkspaceType;
  onSetupComplete?: (toolId: string) => void;
}

export function ToolSetupCard({
  toolName,
  toolId,
  owner,
  onSetupComplete,
}: ToolSetupCardProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [isSetupSheetOpen, setIsSetupSheetOpen] = useState(false);
  const isAdmin = owner.role === "admin";

  const { spaces: spacesAsUser } = useSpaces({
    workspaceId: owner.sId,
    disabled: isAdmin,
  });
  const { spaces: spacesAsAdmin } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isAdmin,
  });
  const spaces = isAdmin ? spacesAsAdmin : spacesAsUser;
  const { addToSpace } = useAddMCPServerToSpace(owner);

  const globalSpace = useMemo(() => {
    return spaces.find((space) => space.kind === "global");
  }, [spaces]);

  // Get available MCPServers (servers that can be installed but aren't yet).
  const { availableMCPServers } = useAvailableMCPServers({
    owner,
  });

  // Get all installed MCP servers with their views across all spaces.
  const { mcpServers, mutateMCPServers } = useMCPServers({
    owner,
  });

  // Find the macthing MCP server for the tool we want to activate.
  const matchingMCPServer = useMemo(() => {
    const installedServer = mcpServers.find((s) =>
      isInternalMCPServerOfName(s.sId, toolId)
    );
    if (installedServer) {
      return installedServer;
    }
    return availableMCPServers.find((server) =>
      isInternalMCPServerOfName(server.sId, toolId)
    );
  }, [mcpServers, availableMCPServers, toolId]);

  // Check if the tool is installed at workspace level.
  // A tool is installed if it exists in mcpServers (installed servers list).
  const isToolActivatedInSystemSpace = useMemo(() => {
    if (!matchingMCPServer) {
      return false;
    }
    return mcpServers.some((s) => s.sId === matchingMCPServer.sId);
  }, [matchingMCPServer, mcpServers]);

  // Check if the tool is in global space.
  // A tool is in global space if it has a view in the global space.
  const isToolActivatedInGlobalSpace = useMemo(() => {
    if (!globalSpace || !matchingMCPServer || !matchingMCPServer.views) {
      return false;
    }
    return matchingMCPServer.views.some(
      (view) => view.spaceId === globalSpace.sId
    );
  }, [matchingMCPServer, globalSpace]);

  // Don't render the card at all if the tool does not exist.
  if (!matchingMCPServer || !globalSpace) {
    return null;
  }

  const getButtonLabel = () => {
    if (!isAdmin) {
      return "Only admins can configure tools";
    }
    if (isActivating) {
      return "Configuring...";
    }
    if (isToolActivatedInGlobalSpace) {
      return "Configured";
    }
    if (isToolActivatedInSystemSpace) {
      return "Add to Company Data";
    }
    return "Configure";
  };

  const getButtonClickHandler = () => {
    return isToolActivatedInSystemSpace
      ? handleAddToGlobalSpace
      : handleActivateClick;
  };

  const handleAddToGlobalSpace = async () => {
    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "onboarding_conversation",
      action: TRACKING_ACTIONS.CLICK,
      extra: { tool_id: toolId, click_target: "tool_setup_card" },
    });
    setIsActivating(true);
    await addToSpace(matchingMCPServer, globalSpace);
    await mutateMCPServers();
    setIsActivating(false);
    onSetupComplete?.(toolId);
  };

  const handleActivateClick = async () => {
    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "onboarding_conversation",
      action: TRACKING_ACTIONS.CLICK,
      extra: { tool_id: toolId, click_target: "tool_setup_card" },
    });
    setIsSetupSheetOpen(true);
  };

  const handleSetupComplete = async () => {
    setIsSetupSheetOpen(false);
    setIsActivating(true);
    await mutateMCPServers();
    setIsActivating(false);
    onSetupComplete?.(toolId);
  };

  return (
    <div className="mb-2 mr-2 inline-block w-72 align-top">
      <ContentMessage
        title={`${asDisplayToolName(toolId) || toolName} Tool`}
        icon={getIcon(matchingMCPServer.icon)}
        variant="primary"
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {matchingMCPServer.description}
          </span>
          <div className="flex justify-between gap-2">
            <div>
              {matchingMCPServer.documentationUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  label="About"
                  href={matchingMCPServer.documentationUrl}
                  target="_blank"
                />
              )}
            </div>
            <Button
              variant="highlight"
              size="sm"
              label={getButtonLabel()}
              onClick={getButtonClickHandler()}
              disabled={
                !isAdmin || isToolActivatedInGlobalSpace || isActivating
              }
            />
          </div>
        </div>
      </ContentMessage>

      {matchingMCPServer && (
        <CreateMCPServerDialog
          owner={owner}
          internalMCPServer={matchingMCPServer}
          setMCPServerToShow={handleSetupComplete}
          setIsLoading={setIsActivating}
          isOpen={isSetupSheetOpen}
          setIsOpen={setIsSetupSheetOpen}
        />
      )}
    </div>
  );
}
