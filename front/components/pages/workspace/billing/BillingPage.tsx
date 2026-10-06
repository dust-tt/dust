import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { BillingInformation } from "@app/components/workspace/billing/BillingInformation";
import { BillingOverview } from "@app/components/workspace/billing/BillingOverview";
import { BillingSeatsOverview } from "@app/components/workspace/billing/BillingSeatsOverview";
import { BillingUpgrade } from "@app/components/workspace/billing/BillingUpgrade";
import { CouponsList } from "@app/components/workspace/billing/CouponsList";
import { FreePlanBilling } from "@app/components/workspace/billing/FreePlanBilling";
import { NextInvoiceOverview } from "@app/components/workspace/billing/NextInvoiceOverview";
import { NextInvoicePreview } from "@app/components/workspace/billing/NextInvoicePreview";
import { RecentInvoices } from "@app/components/workspace/billing/RecentInvoices";
import { SubscriptionProvider } from "@app/components/workspace/billing/SubscriptionContext";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isCreditPricedFreePlan } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspaceCoupons } from "@app/lib/swr/workspaces";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

type BillingTab = "billing-information" | "invoices" | "coupons";

export function BillingPage() {
  const { t } = useLingui();
  const { workspace: owner, subscription } = useAuth();
  const router = useAppRouter();
  const freePlan = isCreditPricedFreePlan(subscription.plan.code);
  const isCreditPriced = isCreditPricedPlan(subscription.plan);

  useEffect(() => {
    if (!isCreditPriced) {
      void router.replace(`/w/${owner.sId}/subscription`);
    }
  }, [isCreditPriced, owner.sId, router]);

  // The Coupons tab is only shown when the workspace has redeemed at least
  // one coupon — most workspaces never do.
  const { coupons } = useWorkspaceCoupons({
    workspaceId: owner.sId,
    disabled: freePlan,
  });
  const hasCoupons = coupons.length > 0;

  const { tab: tabParam } = useQueryParams(["tab"]);
  const billingTab: BillingTab = (() => {
    if (tabParam.value === "invoices") {
      return "invoices";
    }
    if (tabParam.value === "coupons" && hasCoupons) {
      return "coupons";
    }
    return "billing-information";
  })();
  const setBillingTab = (next: BillingTab) => {
    tabParam.setParam(next === "billing-information" ? undefined : next);
  };

  if (!isCreditPriced) {
    return null;
  }

  return (
    <AdminPageContainer>
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title={t`Billing`}
          description={t`Change your subscription and edit your billing information.`}
        />
        <SubscriptionProvider owner={owner} subscription={subscription}>
          {freePlan ? (
            <FreePlanBilling owner={owner} subscription={subscription} />
          ) : (
            <Tabs
              value={billingTab}
              onValueChange={(value) =>
                setBillingTab(
                  value === "invoices" || value === "coupons"
                    ? value
                    : "billing-information"
                )
              }
            >
              <TabsList>
                <TabsTrigger
                  value="billing-information"
                  label={t`Billing information`}
                />
                <TabsTrigger value="invoices" label={t`Invoices`} />
                {hasCoupons && (
                  <TabsTrigger value="coupons" label={t`Coupons`} />
                )}
              </TabsList>
              <TabsContent value="billing-information">
                <AdminSectionAnchor
                  sectionId={ADMIN_SECTION_IDS.billing.information}
                >
                  <div className="flex flex-col mt-8 gap-8">
                    <div className="flex flex-col gap-4">
                      <BillingOverview />
                      <BillingSeatsOverview owner={owner} />
                    </div>
                    <BillingUpgrade />
                    <BillingInformation />
                  </div>
                </AdminSectionAnchor>
              </TabsContent>
              <TabsContent value="invoices">
                <AdminSectionAnchor
                  sectionId={ADMIN_SECTION_IDS.billing.invoices}
                >
                  <div className="flex flex-col mt-8 gap-8">
                    <NextInvoiceOverview />
                    <NextInvoicePreview />
                    <RecentInvoices />
                  </div>
                </AdminSectionAnchor>
              </TabsContent>
              {hasCoupons && (
                <TabsContent value="coupons">
                  <AdminSectionAnchor
                    sectionId={ADMIN_SECTION_IDS.billing.coupons}
                  >
                    <div className="flex flex-col mt-8 gap-8">
                      <CouponsList />
                    </div>
                  </AdminSectionAnchor>
                </TabsContent>
              )}
            </Tabs>
          )}
        </SubscriptionProvider>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
