import { SelfImprovingSkillsConsumptionSection } from "@app/components/pages/workspace/developers/SelfImprovingSkillsConsumptionSection";
import { SelfImprovingSkillsListSection } from "@app/components/workspace/settings/SelfImprovingSkillsListSection";
import { SelfImprovingSkillsSettingsSection } from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import {
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import {
  ContentMessage,
  InfoCircle,
  LinkWrapper,
  Page,
  Stars02,
} from "@dust-tt/sparkle";
import { useState } from "react";

export function SelfImprovingSkillsPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasReinforcement = featureFlags.includes("reinforced_agents");

  const [capMicroUsd, setCapMicroUsd] = useState(() =>
    getReinforcementMonthlyCapMicroUsd(owner)
  );

  const [defaultCapPerSkillMicroUsd, setDefaultCapPerSkillMicroUsd] = useState(
    () => getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(owner)
  );

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage self-improving skills settings.
        </ContentMessage>
      );
    }
    if (!hasReinforcement) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Self-improving skills are not enabled for this workspace.
        </ContentMessage>
      );
    }
    return (
      <>
        <ContentMessage variant="info" size="lg">
          This feature is currently in <strong>beta</strong>, and only available
          to a select group of customers.
          <br />
          Note that the feature is currently free during beta testing but will
          generate additional costs upon release.
          <br />
          Contact{" "}
          <LinkWrapper
            href="mailto:self-improving-skills@dust.tt"
            className="underline"
          >
            self-improving-skills@dust.tt
          </LinkWrapper>{" "}
          to share some feedback about this feature.
        </ContentMessage>
        <SelfImprovingSkillsSettingsSection
          owner={owner}
          onCapSaved={setCapMicroUsd}
          onDefaultCapPerSkillSaved={setDefaultCapPerSkillMicroUsd}
        />
        <SelfImprovingSkillsConsumptionSection
          owner={owner}
          capMicroUsd={capMicroUsd}
        />
        <SelfImprovingSkillsListSection
          owner={owner}
          defaultCapPerSkillMicroUsd={defaultCapPerSkillMicroUsd}
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
