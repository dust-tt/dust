import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { BrandingSection } from "@app/components/workspace/settings/BrandingSection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { cn, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

export function WorkspaceBrandingPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isWhitelabelFramesAllowed = hasFeature("whitelabel_frames");

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={t`Branding`} />
        <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.branding.branding}>
          {isWhitelabelFramesAllowed ? (
            <BrandingSection owner={owner} />
          ) : (
            <div
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-6",
                "border-border bg-muted"
              )}
            >
              <p className="heading-lg text-foreground">
                <Trans>Workspace branding</Trans>
              </p>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Workspace branding is not available for this workspace.
                  Whitelabel frames must be enabled to customize your workspace
                  logo.
                </Trans>
              </p>
            </div>
          )}
        </AdminSectionAnchor>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
