import { ReinforcementSection } from "@app/components/workspace/settings/AgentReinforcementToggle";
import { ReinforcementSkillsSection } from "@app/components/workspace/settings/ReinforcementSkillsSection";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { getReinforcementMonthlyCapMicroUsd } from "@app/lib/reinforcement/consumption";
import { useSkillsReinforcementSpend } from "@app/lib/swr/useReinforcementToggle";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  InformationCircleIcon,
  LinkWrapper,
  Page,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";

interface ReinforcementTotalConsumptionSectionProps {
  owner: LightWorkspaceType;
}

function ReinforcementTotalConsumptionSection({
  owner,
}: ReinforcementTotalConsumptionSectionProps) {
  const { spentMicroUsdBySkillId, isSpendLoading } =
    useSkillsReinforcementSpend({ owner });

  const totalSpentDollars =
    Object.values(spentMicroUsdBySkillId).reduce((sum, v) => sum + v, 0) /
    1_000_000;
  const capDollars = getReinforcementMonthlyCapMicroUsd(owner) / 1_000_000;

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Current period consumption" />
      {isSpendLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <div className="text-sm text-foreground dark:text-foreground-night">
          <span className="font-semibold">${totalSpentDollars.toFixed(2)}</span>{" "}
          spent out of{" "}
          <span className="font-semibold">${capDollars.toFixed(2)}</span>{" "}
          monthly cap
        </div>
      )}
    </Page.Vertical>
  );
}

export function ReinforcementPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasReinforcement = featureFlags.includes("reinforced_agents");

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Only workspace admins can manage self-improving skills settings.
        </ContentMessage>
      );
    }
    if (!hasReinforcement) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
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
        <ReinforcementSection owner={owner} />
        <ReinforcementTotalConsumptionSection owner={owner} />
        <ReinforcementSkillsSection owner={owner} />
      </>
    );
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Self-Improving Skills"
        icon={SparklesIcon}
        description={
          <span>
            Configure self-improving skills settings for this workspace.{" "}
            <a
              href="https://docs.dust.tt/docs/reinforcement"
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
  );
}
