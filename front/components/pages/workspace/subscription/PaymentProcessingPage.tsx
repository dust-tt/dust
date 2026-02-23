import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { BarHeader, Page, Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function PaymentProcessingPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useAppRouter();
  const type = useSearchParam("type");
  const planCode = useSearchParam("plan_code");

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (type === "succeeded") {
      if (subscription.plan.code === planCode) {
        // Then we remove the query params to avoid going through this logic again.
        void router.replace(
          getConversationRoute(owner.sId, "new", "welcome=true")
        );
      } else {
        // If the Stripe webhook is not yet received, we try waiting for it and reload the page every 5 seconds until it's done.
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally passing an empty dependency array to execute only once

  return (
    <>
      <div className="mb-10">
        <BarHeader title={"Dust"} className="ml-10 lg:ml-0" />
      </div>
      <Page>
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <div>
            <Spinner size="xl" />
          </div>
          <div>
            <Page.P>Processing</Page.P>
          </div>
        </div>
      </Page>
    </>
  );
}
