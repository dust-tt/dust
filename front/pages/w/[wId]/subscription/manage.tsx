import { Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
    },
  };
});

export default function ManageSubscription({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  useEffect(() => {
    async function redirectToStripePortal() {
      const res = await fetch("/api/stripe/portal", {
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
    <div className="h-dvh flex w-full items-center justify-center">
      <Spinner />
    </div>
  );
}
