import { TextArea } from "@dust-tt/sparkle";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
} from "@app/components/assistant_builder/types";

interface DataDescriptionProps {
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  action: AssistantBuilderActionState;
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
      description="Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively."
    >
      <TextArea
        placeholder={"This data contains…"}
        value={action.description}
        onChange={(e) => {
          if (e.target.value.length < 800) {
            updateAction({
              actionName: action.name,
              actionDescription: e.target.value,
              getNewActionConfig: (old) => old,
            });
            setShowInvalidActionDescError(null);
          }
        }}
        error={showInvalidActionDescError}
        showErrorLabel
      />
    </ConfigurationSectionContainer>
  );
};
