import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function ManageSubscriptionPage() {
  const owner = useWorkspace();
  const router = useAppRouter();

  useEffect(() => {
    async function redirectToStripePortal() {
      const res = await clientFetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: owner.sId,
        }),
      });

      if (!res.ok) {
        await router.push(`/w/${owner.sId}/subscription`);
        return;
      }

      const content = await res.json();
      if (content.portalUrl) {
        window.location.href = content.portalUrl;
      } else {
        await router.push(`/w/${owner.sId}/subscription`);
      }
    }

    void redirectToStripePortal();
  }, [owner.sId, router]);

  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <Spinner />
    </div>
  );
}
