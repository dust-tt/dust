import { SelfImprovingSkillsConsumptionSection } from "@app/components/pages/workspace/developers/SelfImprovingSkillsConsumptionSection";
import { SelfImprovingSkillsListSection } from "@app/components/workspace/settings/SelfImprovingSkillsListSection";
import { SelfImprovingSkillsSettingsSection } from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import {
  getReinforcementMonthlyCapAwuCredits,
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { useReinforcementBillingUnit } from "@app/lib/swr/useSelfImprovingSkillsSettings";
import { ContentMessage, InfoCircle, Page, Stars02 } from "@dust-tt/sparkle";
import { useState } from "react";

export function SelfImprovingSkillsPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const hasSelfImprovement = useIsSelfImprovementAvailable();

  const unit = useReinforcementBillingUnit({ owner });

  // Caps in the display unit: AWU credits for workspaces billed by Metronome,
  // dollars otherwise.
  const [cap, setCap] = useState(() =>
    unit === "awu_credits"
      ? getReinforcementMonthlyCapAwuCredits(owner)
      : getReinforcementMonthlyCapMicroUsd(owner) / 1_000_000
  );

  const [defaultCapPerSkill, setDefaultCapPerSkill] = useState(() =>
    unit === "awu_credits"
      ? getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(owner)
      : getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(owner) / 1_000_000
  );

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage self-improving skills settings.
        </ContentMessage>
      );
    }
    if (!hasSelfImprovement) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Self-improving skills are not enabled for this workspace.
        </ContentMessage>
      );
    }
    return (
      <>
        <SelfImprovingSkillsSettingsSection
          owner={owner}
          onCapSaved={setCap}
          onDefaultCapPerSkillSaved={setDefaultCapPerSkill}
        />
        <SelfImprovingSkillsConsumptionSection owner={owner} cap={cap} />
        <SelfImprovingSkillsListSection
          owner={owner}
          defaultCapPerSkill={defaultCapPerSkill}
        />
      </>
    );
  };

  return (
    <div className="mb-4">
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Self-Improving Skills"
          icon={Stars02}
          description={
            <span>
              Configure self-improving skills settings for this workspace.{" "}
              <a
                href="https://docs.dust.tt/docs/self-improving-skills"
                target="_blank"
                rel="noopener noreferrer"
                className="text-highlight dark:text-highlight-night underline"
              >
                Learn more
              </a>
              .
            </span>
          }
        />
        {renderBody()}
      </Page.Vertical>
    </div>
  );
}
