import { Page, SliderToggle } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";

interface ProcessingConfigurationProps {
  owner: WorkspaceType;
  transcriptsConfiguration: any;
  transcriptsConfigurationState: {
    provider: string;
    assistantSelected: LightAgentConfigurationType | null;
    isActive: boolean;
  };
  agents: LightAgentConfigurationType[];
  handleSelectAssistant: (
    id: number,
    assistant: LightAgentConfigurationType
  ) => Promise<void>;
  handleSetIsActive: (id: number, isActive: boolean) => Promise<void>;
}

export function ProcessingConfiguration({
  owner,
  transcriptsConfiguration,
  transcriptsConfigurationState,
  agents,
  handleSelectAssistant,
  handleSetIsActive,
}: ProcessingConfigurationProps) {
  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader
        title="Process transcripts automatically"
        description="After each transcribed meeting, Dust will run the agent you selected and send you the result by email."
      />
      <Page.Layout direction="vertical">
        <Page.Layout direction="vertical">
          <Page.Layout direction="horizontal">
            <AssistantPicker
              owner={owner}
              size="sm"
              onItemClick={(assistant) =>
                handleSelectAssistant(transcriptsConfiguration.id, assistant)
              }
              assistants={agents}
              showFooterButtons={false}
            />
            {transcriptsConfigurationState.assistantSelected && (
              <div className="mt-2">
                <Page.P>
                  <strong>
                    @{transcriptsConfigurationState.assistantSelected.name}
                  </strong>
                </Page.P>
              </div>
            )}
            <div className="mt-2">
              <Page.P>
                The agent that will process the transcripts received from{" "}
                {transcriptsConfigurationState.provider
                  .charAt(0)
                  .toUpperCase() +
                  transcriptsConfigurationState.provider.slice(1)}
                .
              </Page.P>
            </div>
          </Page.Layout>
        </Page.Layout>
      </Page.Layout>
      <Page.Layout direction="horizontal" gap="xl">
        <SliderToggle
          selected={transcriptsConfigurationState.isActive}
          onClick={() =>
            handleSetIsActive(
              transcriptsConfiguration.id,
              !transcriptsConfigurationState.isActive
            )
          }
          disabled={!transcriptsConfigurationState.assistantSelected}
        />
        <Page.P>Enable transcripts email processing</Page.P>
      </Page.Layout>
    </Page.Layout>
  );
}
