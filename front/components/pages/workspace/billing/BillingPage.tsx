import { BillingInformation } from "@app/components/workspace/billing/BillingInformation";
import { BillingOverview } from "@app/components/workspace/billing/BillingOverview";
import { BillingSeatsOverview } from "@app/components/workspace/billing/BillingSeatsOverview";
import { BillingUpgrade } from "@app/components/workspace/billing/BillingUpgrade";
import { RecentInvoices } from "@app/components/workspace/billing/RecentInvoices";
import { useAuth } from "@app/lib/auth/AuthContext";
import { CardIcon, Page } from "@dust-tt/sparkle";

export function BillingPage() {
  const { workspace: owner, subscription } = useAuth();
  // const router = useAppRouter();

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Billing"
        icon={CardIcon}
        description="Edit your subscription and billing information."
      />
      <BillingOverview owner={owner} subscription={subscription} />
      <BillingSeatsOverview owner={owner} />
      <BillingUpgrade owner={owner} subscription={subscription} />
      <BillingInformation owner={owner} />
      <RecentInvoices owner={owner} />
    </Page.Vertical>
  );
}
