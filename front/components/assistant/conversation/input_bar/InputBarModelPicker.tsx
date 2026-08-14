import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerHighlight } from "@app/components/assistant/conversation/input_bar/ModelPickerHighlight";
import type { ModelPickerProps } from "@app/components/model_picker/ModelPicker";
import { ModelPicker } from "@app/components/model_picker/ModelPicker";
import { useContext } from "react";

type InputBarModelPickerProps = Omit<
  ModelPickerProps,
  | "buttonVariant"
  | "showLabel"
  | "setStickyModelOverride"
  | "stickyModelOverride"
>;

export function InputBarModelPicker({
  agentModel,
  agentId,
  lastRequestedModel,
  owner,
  buttonSize,
  side = "top",
  disabled,
  selectionRef,
  onSelectionChange,
  commitApiRef,
}: InputBarModelPickerProps) {
  const { stickyModelOverride, setStickyModelOverride, openModelPickerRef } =
    useContext(InputBarContext);

  return (
    <ModelPickerHighlight>
      <ModelPicker
        agentModel={agentModel}
        agentId={agentId}
        lastRequestedModel={lastRequestedModel}
        owner={owner}
        buttonVariant="ghost-secondary"
        buttonSize={buttonSize}
        showLabel={false}
        side={side}
        disabled={disabled}
        selectionRef={selectionRef}
        onSelectionChange={onSelectionChange}
        stickyModelOverride={stickyModelOverride}
        setStickyModelOverride={setStickyModelOverride}
        commitApiRef={commitApiRef}
        openApiRef={openModelPickerRef}
      />
    </ModelPickerHighlight>
  );
}
