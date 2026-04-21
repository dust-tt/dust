/**
 * Tool directive card component.
 *
 * Renders a card for tool directives in markdown content.
 * Displays tool information with logo, description, and action buttons.
 */

import { CreateMCPServerDialog } from "@app/components/actions/mcp/create/CreateMCPServerDialog";
import { getIcon } from "@app/components/resources/resources_icons";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  useAddMCPServerToSpace,
  useAvailableMCPServers,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpaces, useSpacesAsAdmin } from "@app/lib/swr/spaces";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { Button, ContentMessage } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo, useState } from "react";

interface ToolSetupCardProps {
  toolName: string;
  toolId: InternalMCPServerNameType;
  owner: WorkspaceType;
  onSetupComplete?: (toolId: string) => void;
}

type ToolSetupAction = "continue" | "add_to_global_space" | "configure";

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
    kinds: ["global", "regular"],
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

  const existingViewNames = useMemo(
    () =>
      mcpServers.flatMap((s) =>
        (s.views ?? []).map((v) => v.name ?? v.server.name)
      ),
    [mcpServers]
  );

  // Find the matching MCP server for the tool we want to activate.
  const matchingMCPServer = useMemo(() => {
    const installedServer = mcpServers.find((s) =>
      matchesInternalMCPServerName(s.sId, toolId)
    );
    if (installedServer) {
      return installedServer;
    }
    return availableMCPServers.find((server) =>
      matchesInternalMCPServerName(server.sId, toolId)
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

  const toolSetupAction: ToolSetupAction = isToolActivatedInGlobalSpace
    ? "continue"
    : isToolActivatedInSystemSpace
      ? "add_to_global_space"
      : "configure";

  const getButtonLabel = () => {
    if (isActivating) {
      return "Working...";
    }

    switch (toolSetupAction) {
      case "continue":
        return "Continue";
      case "add_to_global_space":
        return isAdmin
          ? `Add to ${GLOBAL_SPACE_NAME}`
          : "Only admins can configure tools";
      case "configure":
        return isAdmin ? "Configure" : "Only admins can configure tools";
      default:
        return assertNever(toolSetupAction);
    }
  };

  const trackToolSetupCardClick = () => {
    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "onboarding_conversation",
      action: TRACKING_ACTIONS.CLICK,
      extra: { tool_id: toolId, click_target: "tool_setup_card" },
    });
  };

  const handleSetupComplete = async () => {
    setIsSetupSheetOpen(false);
    setIsActivating(true);
    await mutateMCPServers();
    setIsActivating(false);
    onSetupComplete?.(toolId);
  };

  const handleButtonClick = async () => {
    trackToolSetupCardClick();

    switch (toolSetupAction) {
      case "continue":
        onSetupComplete?.(toolId);
        return;
      case "add_to_global_space":
        setIsActivating(true);
        await addToSpace(matchingMCPServer, globalSpace);
        await mutateMCPServers();
        setIsActivating(false);
        onSetupComplete?.(toolId);
        return;
      case "configure":
        setIsSetupSheetOpen(true);
        return;
      default:
        assertNever(toolSetupAction);
    }
  };

  const isButtonDisabled =
    isActivating || (toolSetupAction !== "continue" && !isAdmin);

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
              onClick={handleButtonClick}
              disabled={isButtonDisabled}
            />
          </div>
        </div>
      </ContentMessage>

      <CreateMCPServerDialog
        owner={owner}
        internalMCPServer={matchingMCPServer}
        existingViewNames={existingViewNames}
        setMCPServerToShow={handleSetupComplete}
        setIsLoading={setIsActivating}
        isOpen={isSetupSheetOpen}
        setIsOpen={setIsSetupSheetOpen}
      />
    </div>
  );
}
