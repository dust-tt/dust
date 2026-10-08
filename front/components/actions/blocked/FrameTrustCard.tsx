import { clientFetch } from "@app/lib/egress/client";
import { useFrameTrust } from "@app/lib/swr/frames";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  FrameTrustPublisher,
  PostFrameTrustRequestBody,
} from "@app/types/api/frame_trust";
import { isAPIError } from "@app/types/error";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, Button, Card, Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Holds the Frame function calls refused with `frame_trust_required` until the viewer decides
 * whether to trust the Frame's publisher. A decline is remembered until the Frame is reloaded, so
 * later calls fail at once instead of asking again.
 */
export function useFrameTrustGate() {
  const [isTrustRequested, setIsTrustRequested] = useState(false);
  const waitersRef = useRef<((trusted: boolean) => void)[]>([]);
  const declinedRef = useRef(false);

  const requestTrust = useCallback((): Promise<boolean> => {
    if (declinedRef.current) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      waitersRef.current.push(resolve);
      setIsTrustRequested(true);
    });
  }, []);

  const settleTrust = useCallback((trusted: boolean) => {
    declinedRef.current = !trusted;
    const waiters = waitersRef.current;
    waitersRef.current = [];
    setIsTrustRequested(false);
    for (const resolve of waiters) {
      resolve(trusted);
    }
  }, []);

  return { isTrustRequested, requestTrust, settleTrust };
}

interface FrameTrustCardProps {
  frameId: string;
  // Passed in: shared Frames render this card outside of any AuthProvider.
  owner: LightWorkspaceType;
  onSettle: (trusted: boolean) => void;
}

export function FrameTrustCard({
  frameId,
  owner,
  onSettle,
}: FrameTrustCardProps) {
  const { t } = useLingui();
  const { frameTrust, isFrameTrustError } = useFrameTrust({ owner, frameId });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAlreadyTrusted =
    frameTrust?.status === "trusted" || frameTrust?.status === "not_required";
  useEffect(() => {
    // Trust was given elsewhere (e.g. another tab), or the Frame stopped needing it.
    if (isAlreadyTrusted) {
      onSettle(true);
    }
  }, [isAlreadyTrusted, onSettle]);

  const handleTrust = async (publisher: FrameTrustPublisher) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const body: PostFrameTrustRequestBody = { publisherId: publisher.sId };
    const response = await clientFetch(
      `/api/w/${owner.sId}/frames/${encodeURIComponent(frameId)}/trust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    setIsSubmitting(false);
    if (!response.ok) {
      const error = await getErrorFromResponse(response);
      setErrorMessage(
        isAPIError(error) && error.type === "frame_publisher_changed"
          ? t`Someone else published this Frame since you opened it. Reload it to see who.`
          : t`We couldn't save your choice. Try again.`
      );
      return;
    }
    onSettle(true);
  };

  let content: React.ReactNode = null;
  let canTrustPublisher: FrameTrustPublisher | null = null;
  if (isFrameTrustError) {
    content = (
      <div className="text-sm font-medium text-warning-800">
        {t`We couldn't load who published this Frame. Reload it to try again.`}
      </div>
    );
  } else if (!frameTrust) {
    content = (
      <div className="flex justify-center">
        <Spinner size="sm" />
      </div>
    );
  } else {
    switch (frameTrust.status) {
      case "untrusted": {
        const { publisher } = frameTrust;
        const publisherName = publisher.fullName;
        canTrustPublisher = publisher;
        content = (
          <>
            <div className="flex items-center gap-2">
              <Avatar
                size="sm"
                name={publisherName}
                visual={publisher.image}
                isRounded
              />
              <div className="heading-base">{t`Do you trust ${publisherName}?`}</div>
            </div>
            <div className="text-base text-muted-foreground">
              <Trans>
                {publisherName} published this Frame. Its code can use Dust
                tools as you, with your access and your connected accounts, such
                as Gmail or Slack. Only continue if you trust them.
              </Trans>
            </div>
          </>
        );
        break;
      }
      case "untrustable":
        content = (
          <>
            <div className="heading-base">{t`This Frame can't use tools`}</div>
            <div className="text-base text-muted-foreground">
              <Trans>
                Nobody is recorded as its publisher, so it can't use tools on
                your behalf. Ask someone who can edit it to publish it again.
              </Trans>
            </div>
          </>
        );
        break;
      case "trusted":
      case "not_required":
        // Settled by the effect above.
        break;
      default:
        assertNeverAndIgnore(frameTrust);
    }
  }

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex flex-col gap-4 shadow"
    >
      {content}
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800">
          {errorMessage}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          label={canTrustPublisher ? t`Not now` : t`Close`}
          variant="outline"
          disabled={isSubmitting}
          onClick={() => onSettle(false)}
        />
        {canTrustPublisher && (
          <Button
            label={t`Trust`}
            variant="highlight"
            isLoading={isSubmitting}
            onClick={() =>
              canTrustPublisher && void handleTrust(canTrustPublisher)
            }
          />
        )}
      </div>
    </Card>
  );
}
