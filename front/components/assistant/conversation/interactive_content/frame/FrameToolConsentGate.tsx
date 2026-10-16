import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PostFrameToolAuthorizationResponseBody } from "@app/types/api/frame_permissions";
import type { FrameToolCallPair } from "@app/types/api/frame_publication";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

interface FrameToolConsentGateProps {
  owner: LightWorkspaceType;
  frameId: string;
  requiredTools: FrameToolCallPair[];
  onAuthorized: () => void | Promise<void>;
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
      <ul className="max-h-48 w-full max-w-md overflow-auto rounded-lg border border-border/60 bg-muted-background/40 px-4 py-3 text-left text-sm">
        {requiredTools.map(([server, tool]) => (
          <li key={`${server}/${tool}`} className="font-mono text-foreground">
            {server}/{tool}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-warning-500">{error}</p>}
      <Button
        variant="primary"
        label={t`Allow access`}
        isLoading={isAuthorizing}
        disabled={isAuthorizing}
        onClick={() => {
          void authorize();
        }}
      />
    </div>
  );
}
