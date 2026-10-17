import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON, getAvatar } from "@app/lib/actions/mcp_icons";
import { selectServerViewsByReference } from "@app/lib/api/sandbox/server_view_reference";
import {
  useAuthorizeFrameTools,
  useFramePermissions,
} from "@app/lib/swr/frames";
import { useMCPServerViewsFromMemberSpaces } from "@app/lib/swr/mcp_servers";
import type { FrameToolCallPair } from "@app/types/api/frame_publication";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Chip, Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface FrameToolConsentGateProps {
  owner: LightWorkspaceType;
  frameId: string;
  requiredTools: FrameToolCallPair[];
  onAuthorized: () => void | Promise<void>;
}

interface ConsentToolRow {
  serverRef: string;
  toolName: string;
  serverDisplayName: string;
  toolDisplayName: string;
  toolDescription: string | null;
  serverAvatar: ReactNode;
  isNew: boolean;
}

function toolPairKey([server, tool]: FrameToolCallPair): string {
  return `${server}\0${tool}`;
}

/**
 * OAuth-style consent screen shown instead of the Frame iframe until the viewer
 * authorizes the active publication's required tools (or is the last publisher).
 */
export function FrameToolConsentGate({
  owner,
  frameId,
  requiredTools,
  onAuthorized,
}: FrameToolConsentGateProps) {
  const { t } = useLingui();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { frameName, lastPublisherName, authorizedTools } = useFramePermissions(
    {
      owner,
      frameId,
    }
  );
  const { doAuthorize } = useAuthorizeFrameTools({ owner, frameId });

  const { serverViews, isLoading: isServerViewsLoading } =
    useMCPServerViewsFromMemberSpaces(owner);

  const authorizedKeys = useMemo(
    () => new Set(authorizedTools.map(toolPairKey)),
    [authorizedTools]
  );

  // Only call out "New" when the viewer already approved some tools — otherwise
  // every row would be new and the chip adds noise.
  const showNewChips = authorizedTools.length > 0;

  const toolRows = useMemo((): ConsentToolRow[] => {
    return requiredTools.map(([serverRef, toolName]) => {
      // Ambiguous refs must not pick an arbitrary instance for labels/descriptions.
      const matches = selectServerViewsByReference(serverViews, serverRef);
      const view = matches.length === 1 ? matches[0] : undefined;
      const tool = view?.server.tools.find(
        (candidate) => candidate.name === toolName
      );
      return {
        serverRef,
        toolName,
        serverDisplayName: view
          ? getMcpServerViewDisplayName(view)
          : asDisplayName(serverRef),
        toolDisplayName: asDisplayName(toolName),
        toolDescription: tool?.description?.trim() ? tool.description : null,
        serverAvatar: view
          ? getAvatar(view.server, "xs")
          : getAvatar({ icon: DEFAULT_MCP_SERVER_ICON }, "xs"),
        isNew:
          showNewChips &&
          !authorizedKeys.has(toolPairKey([serverRef, toolName])),
      };
    });
  }, [authorizedKeys, requiredTools, serverViews, showNewChips]);

  // Group tools under each server for a clearer consent scan.
  const toolsByServer = useMemo(() => {
    const groups: {
      key: string;
      serverDisplayName: string;
      serverAvatar: ReactNode;
      tools: ConsentToolRow[];
    }[] = [];
    for (const row of toolRows) {
      const existing = groups.find((group) => group.key === row.serverRef);
      if (existing) {
        existing.tools.push(row);
      } else {
        groups.push({
          key: row.serverRef,
          serverDisplayName: row.serverDisplayName,
          serverAvatar: row.serverAvatar,
          tools: [row],
        });
      }
    }
    return groups;
  }, [toolRows]);

  const authorize = useCallback(async () => {
    setIsAuthorizing(true);
    setError(null);
    try {
      const result = await doAuthorize(requiredTools);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await onAuthorized();
    } finally {
      setIsAuthorizing(false);
    }
  }, [doAuthorize, onAuthorized, requiredTools]);

  const consentTitle =
    frameName && lastPublisherName ? (
      <Trans>
        Allow Frame “{frameName}” by {lastPublisherName} to use tools?
      </Trans>
    ) : frameName ? (
      <Trans>Allow Frame “{frameName}” to use tools?</Trans>
    ) : lastPublisherName ? (
      <Trans>Allow this Frame by {lastPublisherName} to use tools?</Trans>
    ) : (
      <Trans>Allow this Frame to use tools?</Trans>
    );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h2 className="heading-base text-foreground">{consentTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {showNewChips ? (
            <Trans>
              New tools were added since you last allowed access. Review the
              list before continuing.
            </Trans>
          ) : (
            <Trans>
              This Frame can call the tools below on your behalf. Review them
              before continuing.
            </Trans>
          )}
        </p>
      </div>
      {isServerViewsLoading ? (
        <div className="flex w-full max-w-md justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : (
        <ul className="max-h-[32rem] w-full max-w-md space-y-3 overflow-auto rounded-lg border border-border/60 bg-muted-background/40 px-4 py-3 text-left">
          {toolsByServer.map((group) => (
            <li key={group.key} className="space-y-2">
              <div className="flex items-center gap-2">
                {group.serverAvatar}
                <span className="heading-sm text-foreground">
                  {group.serverDisplayName}
                </span>
              </div>
              <ul className="space-y-2 border-l border-border/60 pl-3">
                {group.tools.map((tool) => (
                  <li key={`${tool.serverRef}/${tool.toolName}`}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {tool.toolDisplayName}
                      </p>
                      {tool.isNew ? (
                        <Chip size="mini" color="highlight" label={t`New`} />
                      ) : null}
                    </div>
                    {tool.toolDescription ? (
                      <p className="text-sm text-muted-foreground">
                        {tool.toolDescription}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-warning-500">{error}</p>}
      <Button
        variant="primary"
        label={t`Allow access`}
        isLoading={isAuthorizing}
        disabled={isAuthorizing || isServerViewsLoading}
        onClick={() => {
          void authorize();
        }}
      />
    </div>
  );
}
