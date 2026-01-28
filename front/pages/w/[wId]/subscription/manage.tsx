import { Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";

export const getServerSideProps = appGetServerSidePropsForAdmin;

function ManageSubscription() {
  const owner = useWorkspace();
  const router = useRouter();

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

const PageWithAuthLayout = ManageSubscription as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
