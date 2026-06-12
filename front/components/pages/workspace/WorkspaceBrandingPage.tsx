import { BrandingSection } from "@app/components/workspace/settings/BrandingSection";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { cn, Page, Palette } from "@dust-tt/sparkle";

export function WorkspaceBrandingPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const isBrandedFramesAllowed = subscription.plan.isBrandedFramesAllowed;

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header title="Branding" icon={Palette} />
      {isBrandedFramesAllowed ? (
        <BrandingSection owner={owner} />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-6",
            "border-border dark:border-border-night bg-muted dark:bg-muted-night"
          )}
        >
          <p className="heading-lg text-foreground dark:text-foreground-night">
            Workspace branding
          </p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Workspace branding is not available on the current plan. Upgrade to
            a plan that includes branded frames to customize your workspace
            logo.
          </p>
        </div>
      )}
    </Page.Vertical>
  );
}
