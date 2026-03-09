import { GlobeAltIcon, Page } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title="Model Providers"
        icon={GlobeAltIcon}
        description="Configure model providers."
      />
      <Page.Vertical align="stretch" gap="md">
        <></>
      </Page.Vertical>
    </Page.Vertical>
  );
}
