import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import {
  useSelfImprovingBatchModeToggle,
  useSelfImprovingToggle,
} from "@app/lib/swr/useSelfImprovingSkillsSettings";
import type { LightWorkspaceType } from "@app/types/user";
import { SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface SelfImprovingSkillsTogglesSectionProps {
  owner: LightWorkspaceType;
}

export function SelfImprovingSkillsTogglesSection({
  owner,
}: SelfImprovingSkillsTogglesSectionProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleReinforcement } =
    useSelfImprovingToggle({ owner });

  const {
    isEnabled: isBatchModeEnabled,
    isChanging: isBatchModeChanging,
    doToggleBatchMode,
  } = useSelfImprovingBatchModeToggle({ owner });

  // ContextItem.List validates child *element types* (and nested types inside
  // wrappers). Fragments whose nested children include custom components
  // (e.g. SelfImprovingBatchModeToggle) fail that check even when those
  // components eventually render a ContextItem. Keep list children flat.
  return (
    <AdminSectionAnchor
      sectionId={ADMIN_SECTION_IDS.selfImprovingSkills.settings}
    >
      <div className="heading-base text-foreground">
        <Trans>Self-improving skills</Trans>
      </div>
      <SettingsList>
        <SettingsList.Row
          title={t`Allow self-improving skills`}
          description={t`Allow Dust to analyze conversations to improve your workspace's skills. Dust does not use conversations to train models.`}
          action={
            <SliderToggle
              selected={isEnabled}
              disabled={isChanging}
              onClick={doToggleReinforcement}
            />
          }
        />
        <SettingsList.Row
          title={t`Enable batch processing`}
          description={t`Conversations are sent in batches to reduce costs. Data may remain on LLM provider servers for up to several hours before processing. Disable to ensure immediate data deletion (ZDR-compatible). This will increase your plan's pricing.`}

          action={
            <SliderToggle
              selected={isBatchModeEnabled}
              disabled={isBatchModeChanging}
              onClick={doToggleBatchMode}
            />
          }
        />
      </SettingsList>
    </AdminSectionAnchor>
  );
}
