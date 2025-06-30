import { TextArea } from "@dust-tt/sparkle";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import type { AssistantBuilderMCPOrVizState } from "@app/components/assistant_builder/types";

const MAX_DESCRIPTION_LENGTH = 800;

interface DataDescriptionProps {
  updateDescription: (actionDescription: string) => void;
  action: AssistantBuilderMCPOrVizState;
  setShowInvalidActionDescError: (
    showInvalidActionDescError: string | null
  ) => void;
  showInvalidActionDescError: string | null;
}

export const ChildAgentDescription = ({
  updateDescription,
  action,
  setShowInvalidActionDescError,
  showInvalidActionDescError,
}: DataDescriptionProps) => {
  return (
    <ConfigurationSectionContainer
      title="What does the sub agent do?"
      description={
        `Provide a brief description (maximum ${MAX_DESCRIPTION_LENGTH} characters) of the ` +
        "subagent and context to help the agent determine when to utilize it effectively."
      }
    >
      <TextArea
        placeholder={"This sub-agent is specialized in…"}
        value={action.description}
        onChange={(e) => {
          if (e.target.value.length < MAX_DESCRIPTION_LENGTH) {
            updateDescription(e.target.value);
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
