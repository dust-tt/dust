import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { BarHeader, Button, Page, Spinner } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

export function PaymentProcessingPage() {
  const owner = useWorkspace();
  const router = useAppRouter();
  const type = useSearchParam("type");
  const sessionId = useSearchParam("session_id");
  const planCode = useSearchParam("plan_code");
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once
  useEffect(() => {
    if (type !== "succeeded") {
      return;
    }

    const checkStatus = async () => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/subscriptions/checkout-status?session_id=${sessionId}&plan_code=${planCode}`
      );
      const data = (await res.json()) as
        | { status: "success" }
        | { status: "error"; message: string }
        | { status: "pending" };

      if (data.status === "success") {
        void router.replace(
          getConversationRoute(owner.sId, "new", "welcome=true")
        );
      } else if (data.status === "error") {
        setError(data.message);
      } else {
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    };

    void checkStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-10">
        <BarHeader title={"Payment Processing"} className="ml-10 lg:ml-0" />
      </div>
      <Page>
        <div className="flex h-full w-full flex-col items-center justify-center gap-4">
          {error ? (
            <>
              <Page.P>
                Something went wrong while setting up your subscription: {error}
              </Page.P>
              <Button
                label="Back to subscribe"
                onClick={() => void router.replace(`/w/${owner.sId}/subscribe`)}
              />
            </>
          ) : (
            <>
              <Spinner size="xl" />
              <Page.P>Processing</Page.P>
            </>
          )}
        </div>
      </Page>
    </>
  );
}
