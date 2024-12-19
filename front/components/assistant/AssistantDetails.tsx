import {
  Avatar,
  ContentMessage,
  ElementModal,
  InformationCircleIcon,
  Page,
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
  useUpdateAgentScope,
} from "@app/lib/swr/assistants";
import { classNames } from "@app/lib/utils";

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

  const DescriptionSection = () => (
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

  return (
    <ElementModal
      openOnElement={agentConfiguration}
      title=""
      onClose={() => onClose()}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-foreground">
        <DescriptionSection />
        <AssistantActionsSection
          agentConfiguration={agentConfiguration}
          owner={owner}
        />
        <InstructionsSection />
      </div>
    </ElementModal>
  );
}
