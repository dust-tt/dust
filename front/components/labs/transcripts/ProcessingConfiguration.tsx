import { Page, SliderToggle } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { KeyedMutator } from "swr";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

interface ProcessingConfigurationProps {
  owner: WorkspaceType;
  transcriptsConfiguration: any;
  transcriptsConfigurationState: {
    provider: string;
    assistantSelected: LightAgentConfigurationType | null;
    isActive: boolean;
  };
  agents: LightAgentConfigurationType[];
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
}

export function ProcessingConfiguration({
  owner,
  transcriptsConfiguration,
  transcriptsConfigurationState,
  agents,
  mutateTranscriptsConfiguration,
}: ProcessingConfigurationProps) {
  const sendNotification = useSendNotification();

  const workspaceId = owner.sId;
  const transcriptConfigurationId = transcriptsConfiguration.id;
  const makePatchRequest = async (
    data: Partial<PatchTranscriptsConfiguration>,
    successMessage: string
  ) => {
    const response = await fetch(
      `/api/w/${workspaceId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: successMessage,
    });

    await mutateTranscriptsConfiguration();
  };

  const handleSelectAssistant = async (
    assistant: LightAgentConfigurationType
  ) => {
    await makePatchRequest(
      {
        isActive: transcriptsConfigurationState.isActive,
        agentConfigurationId: assistant.sId,
      },
      `The agent that will help you summarize your transcripts has been set to @${assistant.name}`
    );
  };

  const handleSetIsActive = async (isActive: boolean) => {
    await makePatchRequest(
      { isActive },
      isActive
        ? "We will start summarizing your meeting transcripts."
        : "We will no longer summarize your meeting transcripts."
    );
  };

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
              onItemClick={(assistant) => handleSelectAssistant(assistant)}
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
            handleSetIsActive(!transcriptsConfigurationState.isActive)
          }
          disabled={!transcriptsConfigurationState.assistantSelected}
        />
        <Page.P>Enable transcripts email processing</Page.P>
      </Page.Layout>
    </Page.Layout>
  );
}
