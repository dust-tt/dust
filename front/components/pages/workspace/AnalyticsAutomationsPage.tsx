import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { cn, Page } from "@dust-tt/sparkle";

export function AnalyticsAutomationsPage() {
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_automations");

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={<Page.H variant="h3">Automation</Page.H>} />
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-6",
            "border-border bg-muted"
          )}
        >
          <p className="text-sm text-muted-foreground">
            This page is not enabled for this workspace.
          </p>
        </div>
      </Page.Vertical>
    );
  }

  return (
    <Page.Vertical align="stretch" gap="none">
      <Page.Header
        title={
          <div className="flex max-w-[700px] flex-col gap-1">
            <Page.H variant="h3">Automation</Page.H>
            <Page.P variant="secondary">
              Everything that runs on its own: what it costs, how often, and who
              set it up.
            </Page.P>
          </div>
        }
      />
      <div className="flex flex-col gap-8 pb-8 pt-4">
        <Page.P variant="secondary">Coming soon.</Page.P>
      </div>
    </Page.Vertical>
  );
}
