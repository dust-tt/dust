import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useFetcher } from "@app/lib/swr/swr";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function ManageSubscriptionPage() {
  const { fetcherWithBody } = useFetcher();
  const owner = useWorkspace();
  const router = useAppRouter();

  useEffect(() => {
    async function redirectToStripePortal() {
      try {
        const content = await fetcherWithBody([
          "/api/stripe/portal",
          { workspaceId: owner.sId },
          "POST",
        ]);
        if (content.portalUrl) {
          window.location.href = content.portalUrl;
        } else {
          await router.push(`/w/${owner.sId}/subscription`);
        }
      } catch {
        await router.push(`/w/${owner.sId}/subscription`);
      }
    }

    void redirectToStripePortal();
  }, [owner.sId, router, fetcherWithBody]);

  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <Spinner />
    </div>
  );
}
