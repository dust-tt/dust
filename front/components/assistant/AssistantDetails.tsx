import {
  Avatar,
  ContentMessage,
  ElementModal,
  HandThumbDownIcon,
  HandThumbUpIcon,
  InformationCircleIcon,
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, WorkspaceType } from "@dust-tt/types";
import { useCallback, useState } from "react";

import { AssistantDetailsButtonBar } from "@app/components/assistant/AssistantDetailsButtonBar";
import { AssistantActionsSection } from "@app/components/assistant/details/AssistantActionsSection";
import { AssistantUsageSection } from "@app/components/assistant/details/AssistantUsageSection";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import { SharingDropdown } from "@app/components/assistant_builder/Sharing";
import {
  useAgentConfiguration,
  useAgentConfigurationFeedbacks,
  useUpdateAgentScope,
} from "@app/lib/swr/assistants";
import { classNames, timeAgoFrom } from "@app/lib/utils";

type AssistantDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  assistantId: string | null;
};

export function AssistantDetails({
  assistantId,
  onClose,
  owner,
}: AssistantDetailsProps) {
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });

  const doUpdateScope = useUpdateAgentScope({
    owner,
    agentConfigurationId: assistantId,
  });

  const updateScope = useCallback(
    async (scope: Exclude<AgentConfigurationScope, "global">) => {
      setIsUpdatingScope(true);
      await doUpdateScope(scope);
      setIsUpdatingScope(false);
    },
    [doUpdateScope]
  );

  if (!agentConfiguration) {
    return <></>;
  }

  const TopSection = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar
          name="Assistant avatar"
          visual={agentConfiguration.pictureUrl}
          size="lg"
        />
        <div className="flex grow flex-col gap-1">
          <div
            className={classNames(
              "font-bold text-foreground",
              agentConfiguration.name.length > 20 ? "text-md" : "text-lg"
            )}
          >{`@${agentConfiguration.name}`}</div>
          {agentConfiguration.status === "active" && (
            <SharingDropdown
              owner={owner}
              agentConfiguration={agentConfiguration}
              initialScope={agentConfiguration.scope}
              newScope={agentConfiguration.scope}
              disabled={isUpdatingScope}
              setNewScope={(scope) => updateScope(scope)}
            />
          )}
        </div>
      </div>
    </div>
  );

  const TabsSection = () => (
    <Tabs defaultValue="performance">
      <TabsList>
        <TabsTrigger value="info" label="Info" icon={InformationCircleIcon} />
        <TabsTrigger
          value="performance"
          label="Performance"
          icon={HandThumbUpIcon}
        />
      </TabsList>
      <TabsContent value="info">
        <InfoSection />
      </TabsContent>
      <TabsContent value="performance">
        <FeedbacksSection />
      </TabsContent>
    </Tabs>
  );

  const InfoSection = () => (
    <div className="mt-2 flex flex-col gap-5">
      {agentConfiguration.status === "active" && (
        <AssistantDetailsButtonBar
          owner={owner}
          agentConfiguration={agentConfiguration}
        />
      )}

      {agentConfiguration.status === "archived" && (
        <ContentMessage
          variant="amber"
          title="This assistant has been deleted."
          icon={InformationCircleIcon}
          size="md"
        >
          It is no longer active and cannot be used.
        </ContentMessage>
      )}

      <div className="text-sm text-foreground">
        {agentConfiguration.description}
      </div>
      <AssistantUsageSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />
      <Page.Separator />
      <AssistantActionsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />
      <InstructionsSection />
    </div>
  );

  const InstructionsSection = () =>
    agentConfiguration.instructions ? (
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold text-element-800">Instructions</div>
        <ReadOnlyTextArea content={agentConfiguration.instructions} />
      </div>
    ) : (
      "This assistant has no instructions."
    );

  const FeedbacksSection = () => {
    const {
      agentConfigurationFeedbacks,
      isAgentConfigurationFeedbacksLoading,
    } = useAgentConfigurationFeedbacks({
      workspaceId: owner.sId,
      agentConfigurationId: assistantId,
    });

    return isAgentConfigurationFeedbacksLoading ? (
      <Spinner />
    ) : (
      <div>
        {!agentConfigurationFeedbacks ||
        agentConfigurationFeedbacks.length === 0 ? (
          <div>No feedbacks.</div>
        ) : (
          <div className="mt-3">
            <Page.H variant="h6">
              Latest version ({agentConfiguration.version})
            </Page.H>
            {agentConfigurationFeedbacks.map((feedback, index) => (
              <div key={feedback.id}>
                {index > 0 &&
                  feedback.agentConfigurationVersion !==
                    agentConfigurationFeedbacks[index - 1]
                      .agentConfigurationVersion && (
                    <Page.H variant="h6">
                      Version {feedback.agentConfigurationVersion}
                    </Page.H>
                  )}
                <ContentMessage variant="slate" className="my-2">
                  <div className="justify-content-around mb-3 flex items-center gap-2">
                    <div className="flex w-full items-center gap-2">
                      <Avatar size="xs" name="Eleanor Wright" /> Eleanor Wright
                    </div>
                    <div className="flex-shrink-0 text-xs text-muted-foreground">
                      {timeAgoFrom(
                        feedback.createdAt instanceof Date
                          ? feedback.createdAt.getTime()
                          : new Date(feedback.createdAt).getTime(),
                        {
                          useLongFormat: true,
                        }
                      )}{" "}
                      ago
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-grow">{feedback.content}</div>
                    <div className="flex-shrink-0">
                      {feedback.thumbDirection === "up" ? (
                        <button className="rounded bg-sky-200 p-2">
                          <HandThumbUpIcon />
                        </button>
                      ) : (
                        <button className="rounded bg-warning-200 p-2">
                          <HandThumbDownIcon />
                        </button>
                      )}
                    </div>
                  </div>
                </ContentMessage>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ElementModal
      openOnElement={agentConfiguration}
      title=""
      onClose={() => onClose()}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-foreground">
        <TopSection />
        <TabsSection />
      </div>
    </ElementModal>
  );
}
