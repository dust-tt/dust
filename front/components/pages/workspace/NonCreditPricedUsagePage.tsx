import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { LegacyProgrammaticUsagePanel } from "@app/components/pages/workspace/developers/LegacyProgrammaticUsagePanel";
import { UsageProgrammaticLimitCard } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { isAdmin } from "@app/types/user";
import {
  Button,
  LinkExternal01,
  Page,
  Plus,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

// Keep every tab panel at least as tall as the scrolling panel so switching to a
// shorter (or still loading) tab never shrinks the page and clamps the scroll offset.
// Sparkle renders TabsContent as `contents`, so `block` is required for the min-height to apply.
const TAB_CONTENT_CLASS = "block min-h-panel";

type UsageTab = "programmatic-usage" | "settings";

/**
 * Credits admin page for workspaces that are not on a credit-priced plan.
 * No credit pool, seats, spend limits, upgrade requests, or model-tier
 * administration — programmatic usage (legacy credits + limits) remains
 * editable. Model-tier administration is only available on credit-priced plans.
 */
export function NonCreditPricedUsagePage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const isWorkspaceAdmin = isAdmin(owner);

  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);

  const { tab: tabParam } = useQueryParams(["tab"]);
  const usageTab: UsageTab = (() => {
    const value = tabParam.value;
    if (value === "settings" && isWorkspaceAdmin) {
      return "settings";
    }
    return "programmatic-usage";
  })();
  const setUsageTab = (next: UsageTab) => {
    tabParam.setParam(next === "programmatic-usage" ? undefined : next);
  };

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={
            <div className="flex w-full items-center justify-between gap-4">
              <Page.H variant="h3">
                <Trans>Credits</Trans>
              </Page.H>
              <div className="flex items-center gap-4">
                <Button
                  label={t`Breakdown in analytics`}
                  iconRight={LinkExternal01}
                  size="xs"
                  variant="highlight-ghost"
                  href={`/w/${owner.sId}/analytics/consumption`}
                />
                {isWorkspaceAdmin ? (
                  <AdminSectionAnchor
                    sectionId={ADMIN_SECTION_IDS.usage.addCredits}
                  >
                    <div className="flex justify-end">
                      <Button
                        label={t`Add credits`}
                        icon={Plus}
                        size="sm"
                        variant="outline"
                        onClick={() => setShowBuyCreditDialog(true)}
                      />
                    </div>
                  </AdminSectionAnchor>
                ) : null}
              </div>
            </div>
          }
          description={t`Control credit consumption across your workspace.`}
        />

        <Tabs
          value={usageTab}
          onValueChange={(v) =>
            setUsageTab(v === "settings" ? "settings" : "programmatic-usage")
          }
          className="flex flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger
              value="programmatic-usage"
              label={t`Programmatic usage`}
            />
            {isWorkspaceAdmin && (
              <TabsTrigger value="settings" label={t`Settings`} />
            )}
          </TabsList>

          <TabsContent
            value="programmatic-usage"
            forceMount
            className={
              usageTab === "programmatic-usage" ? TAB_CONTENT_CLASS : "hidden"
            }
          >
            <LegacyProgrammaticUsagePanel
              isBuyCreditDialogOpen={showBuyCreditDialog}
              onBuyCreditDialogOpenChange={setShowBuyCreditDialog}
              disabled={usageTab !== "programmatic-usage"}
              showHeader={false}
            />
          </TabsContent>

          {isWorkspaceAdmin && (
            <TabsContent
              value="settings"
              forceMount
              className={usageTab === "settings" ? TAB_CONTENT_CLASS : "hidden"}
            >
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.usage.programmatic}
              >
                <div className="flex flex-col gap-8">
                  <UsageProgrammaticLimitCard owner={owner} />
                </div>
              </AdminSectionAnchor>
            </TabsContent>
          )}
        </Tabs>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
