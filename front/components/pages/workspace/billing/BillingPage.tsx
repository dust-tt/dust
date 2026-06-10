import { BillingInformation } from "@app/components/workspace/billing/BillingInformation";
import { BillingOverview } from "@app/components/workspace/billing/BillingOverview";
import { BillingSeatsOverview } from "@app/components/workspace/billing/BillingSeatsOverview";
import { BillingUpgrade } from "@app/components/workspace/billing/BillingUpgrade";
import { NextInvoiceOverview } from "@app/components/workspace/billing/NextInvoiceOverview";
import { NextInvoicePreview } from "@app/components/workspace/billing/NextInvoicePreview";
import { RecentInvoices } from "@app/components/workspace/billing/RecentInvoices";
import { SubscriptionProvider } from "@app/components/workspace/billing/SubscriptionContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  CreditCard01,
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

export function BillingPage() {
  const { workspace: owner, subscription } = useAuth();

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Billing"
        icon={CreditCard01}
        description="Change your subscription and edit your billing information."
      />
      <SubscriptionProvider owner={owner} subscription={subscription}>
        <Tabs defaultValue="billing-information">
          <TabsList>
            <TabsTrigger
              value="billing-information"
              label="Billing information"
            />
            <TabsTrigger value="invoices" label="Invoices" />
          </TabsList>
          <TabsContent value="billing-information">
            <div className="flex flex-col mt-8 gap-8">
              <div className="flex flex-col gap-4">
                <BillingOverview />
                <BillingSeatsOverview owner={owner} />
              </div>
              <BillingUpgrade />
              <BillingInformation />
            </div>
          </TabsContent>
          <TabsContent value="invoices">
            <div className="flex flex-col mt-8 gap-8">
              <NextInvoiceOverview />
              <NextInvoicePreview />
              <RecentInvoices />
            </div>
          </TabsContent>
        </Tabs>
      </SubscriptionProvider>
    </Page.Vertical>
  );
}
