import {
  useReinforcementBatchModeToggle,
  useReinforcementToggle,
} from "@app/lib/swr/useReinforcementToggle";
import type { WorkspaceType } from "@app/types/user";
import {
  Chip,
  ContentMessage,
  ContextItem,
  Page,
  SliderToggle,
  SparklesIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";

interface ReinforcementSectionProps {
  owner: WorkspaceType;
}

export function ReinforcementSection({ owner }: ReinforcementSectionProps) {
  const { isEnabled, isChanging, doToggleReinforcement } =
    useReinforcementToggle({ owner });

  // TODO(reinforcement): Add link to doc
  return (
    <Page.Vertical align="stretch" gap="md">
      <div className="flex items-center gap-2">
        <Page.H variant="h4">Reinforcement</Page.H>
        <Chip size="xs" color="golden" label="Beta" />
      </div>
      <ContentMessage variant="info" size="lg">
        This feature is currently in beta, and only available to a select group
        of customers. We are very interested in your feedback to improve the
        feature. Note that the feature is currently free during beta testing but
        will generate additional costs upon release.
      </ContentMessage>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <ContextItem
          title="Allow reinforcement"
          visual={<SparklesIcon className="h-6 w-6 shrink-0" />}
          hasSeparatorIfLast={true}
          action={
            <SliderToggle
              selected={isEnabled}
              disabled={isChanging}
              onClick={doToggleReinforcement}
            />
          }
        >
          <ContextItem.Description description="Allow Dust to analyze conversations to improve your workspace's skills. Dust does not use conversations to train models." />
        </ContextItem>
        {isEnabled && <ReinforcementBatchModeToggle owner={owner} />}
      </ContextItem.List>
    </Page.Vertical>
  );
}

function ReinforcementBatchModeToggle({ owner }: ReinforcementSectionProps) {
  const { isEnabled, isChanging, doToggleBatchMode } =
    useReinforcementBatchModeToggle({ owner });

  return (
    <ContextItem
      title="Enable batch processing"
      visual={<Square3Stack3DIcon className="h-6 w-6 shrink-0" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleBatchMode}
        />
      }
    >
      <ContextItem.Description description="Conversations are sent in batches to reduce costs. Data may remain on LLM provider servers for up to several hours before processing. Disable to ensure immediate data deletion (ZDR-compatible). This will increase your plan's pricing." />
    </ContextItem>
  );
}
