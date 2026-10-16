import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON, getAvatar } from "@app/lib/actions/mcp_icons";
import { selectServerViewsByReference } from "@app/lib/api/sandbox/server_view_reference";
import { clientFetch } from "@app/lib/egress/client";
import { useMCPServerViewsFromMemberSpaces } from "@app/lib/swr/mcp_servers";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PostFrameToolAuthorizationResponseBody } from "@app/types/api/frame_permissions";
import type { FrameToolCallPair } from "@app/types/api/frame_publication";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
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

  const { serverViews, isLoading: isServerViewsLoading } =
    useMCPServerViewsFromMemberSpaces(owner);

  const toolRows = useMemo((): ConsentToolRow[] => {
    return requiredTools.map(([serverRef, toolName]) => {
      const view = selectServerViewsByReference(serverViews, serverRef)[0];
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
      };
    });
  }, [requiredTools, serverViews]);

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
      const response = await clientFetch(
        `/api/w/${owner.sId}/frames/${encodeURIComponent(frameId)}/tool-authorizations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorizedTools: requiredTools }),
        }
      );
      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        setError(errorData.message);
        return;
      }
      (await response.json()) as PostFrameToolAuthorizationResponseBody;
      await onAuthorized();
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Something went wrong.`);
    } finally {
      setIsAuthorizing(false);
    }
  }, [frameId, onAuthorized, owner.sId, requiredTools, t]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="max-w-md space-y-2">
        <h2 className="heading-base text-foreground">
          <Trans>Allow this Frame to use tools?</Trans>
        </h2>
        <p className="text-sm text-muted-foreground">
          <Trans>
            This Frame can call the tools below on your behalf. Review them
            before continuing.
          </Trans>
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
                    <p className="text-sm font-medium text-foreground">
                      {tool.toolDisplayName}
                    </p>
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
