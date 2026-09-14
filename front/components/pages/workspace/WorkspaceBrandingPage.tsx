import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { BrandingSection } from "@app/components/workspace/settings/BrandingSection";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { cn, Page } from "@dust-tt/sparkle";

export function WorkspaceBrandingPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isWhitelabelFramesAllowed = hasFeature("whitelabel_frames");

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title="Branding" />
        {isWhitelabelFramesAllowed ? (
          <BrandingSection owner={owner} />
        ) : (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-6",
              "border-border bg-muted"
            )}
          >
            <p className="heading-lg text-foreground">Workspace branding</p>
            <p className="text-sm text-muted-foreground">
              Workspace branding is not available for this workspace. Whitelabel
              frames must be enabled to customize your workspace logo.
            </p>
          </div>
        )}
      </Page.Vertical>
    </AdminPageContainer>
  );
}
