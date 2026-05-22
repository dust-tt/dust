import { CardIcon, Page } from "@dust-tt/sparkle";

export function BillingPage() {
  // const owner = useWorkspace();
  // const { subscription } = useAuth();
  // const router = useAppRouter();

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Billing"
        icon={CardIcon}
        description="Edit your subscription and billing information."
      />
      {/* TODO: Settings section*/}
        <div> TODO </div>
    </Page.Vertical>
  );
}
