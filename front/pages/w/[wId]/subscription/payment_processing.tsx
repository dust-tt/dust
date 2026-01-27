import { BarHeader, Page, Spinner } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React, { useEffect } from "react";

import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { getConversationRoute } from "@app/lib/utils/router";

export const getServerSideProps = appGetServerSidePropsForAdmin;

function PaymentProcessing() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
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

const PageWithAuthLayout = PaymentProcessing as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
