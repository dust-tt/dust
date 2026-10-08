import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAuthContext, useCheckoutStatus } from "@app/lib/swr/workspaces";
import { getConversationRoute } from "@app/lib/utils/router";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { BarHeader, Button, Page, Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

const MAX_CHECKOUT_POLL_ATTEMPTS = 15;
const CHECKOUT_POLL_INTERVAL_MS = 2000;

export function PaymentProcessingPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const router = useAppRouter();
  const formatErrorDescription = useFormatErrorDescription();
  const type = useSearchParam("type");
  const sessionId = useSearchParam("session_id");
  const planCode = useSearchParam("plan_code");
  const [error, setError] = useState<string | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);
  const pollCountRef = useRef(0);

  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });

  const { checkoutStatus } = useCheckoutStatus({
    workspaceId: owner.sId,
    sessionId: sessionId ?? "",
    planCode: planCode ?? "",
    disabled: type !== "succeeded" || !sessionId || !planCode,
    pollIntervalMs: shouldPoll ? CHECKOUT_POLL_INTERVAL_MS : 0,
  });

  useEffect(() => {
    if (!checkoutStatus) {
      return;
    }
    switch (checkoutStatus.status) {
      case "success":
        setShouldPoll(false);
        void (async () => {
          await mutateAuthContext();
          void router.replace(
            getConversationRoute(owner.sId, "new", "welcome=true")
          );
        })();
        break;
      case "error":
        setShouldPoll(false);
        setError(formatErrorDescription(checkoutStatus));
        break;
      case "pending":
        pollCountRef.current += 1;
        if (pollCountRef.current >= MAX_CHECKOUT_POLL_ATTEMPTS) {
          setShouldPoll(false);
          setError(t`Payment processing timed out.`);
        }
        break;
      default:
        assertNeverAndIgnore(checkoutStatus);
    }
  }, [
    checkoutStatus,
    formatErrorDescription,
    mutateAuthContext,
    owner.sId,
    router,
    t,
  ]);

  return (
    <>
      <div className="mb-10">
        <BarHeader title={t`Payment processing`} className="ml-10 lg:ml-0" />
      </div>
      <Page>
        <div className="flex h-full w-full flex-col items-center justify-center gap-4">
          {error ? (
            <>
              <Page.P>
                <Trans>
                  Something went wrong while setting up your subscription:{" "}
                  {error}
                </Trans>
              </Page.P>
              <Button
                label={t`Back to subscribe`}
                onClick={() => void router.replace(`/w/${owner.sId}/subscribe`)}
              />
            </>
          ) : (
            <>
              <Spinner size="lg" />
              <Page.P>
                <Trans>Processing</Trans>
              </Page.P>
            </>
          )}
        </div>
      </Page>
    </>
  );
}
