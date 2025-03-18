import { Page, SliderToggle } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import type { KeyedMutator } from "swr";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useUpdateTranscriptsConfiguration } from "@app/lib/swr/labs";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type {
  LabsTranscriptsConfigurationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface ProcessingConfigurationProps {
  owner: LightWorkspaceType;
  transcriptsConfiguration: LabsTranscriptsConfigurationType;
  agents: LightAgentConfigurationType[];
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
}

export function ProcessingConfiguration({
  owner,
  transcriptsConfiguration,
  agents,
  mutateTranscriptsConfiguration,
}: ProcessingConfigurationProps) {
  const [assistantSelected, setAssistantSelected] =
    useState<LightAgentConfigurationType | null>(
      transcriptsConfiguration.agentConfigurationId
        ? agents.find(
            (agent) =>
              agent.sId === transcriptsConfiguration.agentConfigurationId
          ) ?? null
        : null
    );

  const sendNotification = useSendNotification();
  const updateTranscriptsConfiguration = useUpdateTranscriptsConfiguration({
    workspaceId: owner.sId,
    transcriptConfigurationId: transcriptsConfiguration.id,
  });

  const handleSelectAssistant = async (
    assistant: LightAgentConfigurationType
  ) => {
    setAssistantSelected(assistant);
    const success = await updateTranscriptsConfiguration({
      isActive: transcriptsConfiguration.isActive,
      agentConfigurationId: assistant.sId,
    });

    if (success) {
      sendNotification({
        type: "success",
        title: "Success!",
        description: `The agent that will help you summarize your transcripts has been set to @${assistant.name}`,
      });
      await mutateTranscriptsConfiguration();
    } else {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
    }
  };

  const handleSetIsActive = async (isActive: boolean) => {
    const success = await updateTranscriptsConfiguration({ isActive });

    if (success) {
      sendNotification({
        type: "success",
        title: "Success!",
        description: isActive
          ? "We will start summarizing your meeting transcripts."
          : "We will no longer summarize your meeting transcripts.",
      });
      await mutateTranscriptsConfiguration();
    } else {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
    }
  };

  useEffect(() => {
    setAssistantSelected(
      transcriptsConfiguration.agentConfigurationId
        ? agents.find(
            (agent) =>
              agent.sId === transcriptsConfiguration.agentConfigurationId
          ) ?? null
        : null
    );
  }, [agents, transcriptsConfiguration.agentConfigurationId]);

  if (!transcriptsConfiguration.provider) {
    return null;
  }

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
            {assistantSelected && (
              <div className="mt-2">
                <Page.P>
                  <strong>@{assistantSelected.name}</strong>
                </Page.P>
              </div>
            )}
            <div className="mt-2">
              <Page.P>
                The agent that will process the transcripts received from{" "}
                {transcriptsConfiguration.provider?.charAt(0).toUpperCase() +
                  transcriptsConfiguration.provider.slice(1)}
                .
              </Page.P>
            </div>
          </Page.Layout>
        </Page.Layout>
      </Page.Layout>
      <Page.Layout direction="horizontal" gap="xl">
        <SliderToggle
          selected={transcriptsConfiguration.isActive}
          onClick={() => handleSetIsActive(!transcriptsConfiguration.isActive)}
          disabled={!assistantSelected}
        />
        <Page.P>Enable transcripts email processing</Page.P>
      </Page.Layout>
    </Page.Layout>
  );
}
