import { TextArea } from "@dust-tt/sparkle";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import type {
  AssistantBuilderMCPConfiguration,
  AssistantBuilderMCPOrVizState,
} from "@app/components/assistant_builder/types";

const MAX_DESCRIPTION_LENGTH = 800;

interface DataDescriptionProps {
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderMCPConfiguration["configuration"]
    ) => AssistantBuilderMCPConfiguration["configuration"];
  }) => void;
  action: AssistantBuilderMCPOrVizState;
  setShowInvalidActionDescError: (
    showInvalidActionDescError: string | null
  ) => void;
  showInvalidActionDescError: string | null;
}

export const DataDescription = ({
  updateAction,
  action,
  setShowInvalidActionDescError,
  showInvalidActionDescError,
}: DataDescriptionProps) => {
  return (
    <ConfigurationSectionContainer
      title="What’s the data?"
      description={
        `Provide a brief description (maximum ${MAX_DESCRIPTION_LENGTH} characters) of the data ` +
        "content and context to help the agent determine when to utilize it effectively."
      }
    >
      <TextArea
        placeholder={"This data contains…"}
        value={action.description}
        onChange={(e) => {
          if (e.target.value.length < MAX_DESCRIPTION_LENGTH) {
            updateAction({
              actionName: action.name,
              actionDescription: e.target.value,
              getNewActionConfig: (old) => old,
            });
            setShowInvalidActionDescError(null);
          } else {
            setShowInvalidActionDescError(
              `The description must be less than ${MAX_DESCRIPTION_LENGTH} characters.`
            );
          }
        }}
        error={showInvalidActionDescError}
        showErrorLabel
      />
    </ConfigurationSectionContainer>
  );
};
