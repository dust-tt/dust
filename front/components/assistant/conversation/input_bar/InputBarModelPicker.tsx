import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerHighlight } from "@app/components/assistant/conversation/input_bar/ModelPickerHighlight";
import type { ModelPickerProps } from "@app/components/model_picker/ModelPicker";
import { ModelPicker } from "@app/components/model_picker/ModelPicker";
import { useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { useContext, useEffect } from "react";

type InputBarModelPickerProps = Omit<
  ModelPickerProps,
  | "buttonVariant"
  | "showDropdownArrow"
  | "showLabel"
  | "onShownSelectionChange"
  | "setStickyModelOverride"
  | "stickyModelOverride"
  | "trackingSurface"
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
  const {
    stickyModelOverride,
    setStickyModelOverride,
    openModelPickerRef,
    setPickerShownSelection,
  } = useContext(InputBarContext);

  // On mobile (and in the narrow extension) the input bar has no room for the
  // model name, so the trigger stays icon-only with its tooltip.
  const isWidthConstrained = useIsWidthConstrained();

  // A published selection means "a live picker is showing this". Clear it on
  // unmount so consumers (e.g. degraded retries) never act on a stale one.
  useEffect(
    () => () => setPickerShownSelection(null),
    [setPickerShownSelection]
  );

  return (
    <ModelPickerHighlight>
      <ModelPicker
        agentModel={agentModel}
        agentId={agentId}
        lastRequestedModel={lastRequestedModel}
        owner={owner}
        buttonVariant="ghost-secondary"
        buttonSize={buttonSize}
        showLabel={!isWidthConstrained}
        showDropdownArrow
        side={side}
        disabled={disabled}
        selectionRef={selectionRef}
        onSelectionChange={onSelectionChange}
        stickyModelOverride={stickyModelOverride}
        setStickyModelOverride={setStickyModelOverride}
        commitApiRef={commitApiRef}
        openApiRef={openModelPickerRef}
        onShownSelectionChange={setPickerShownSelection}
        trackingSurface="conversation_input_bar"
      />
    </ModelPickerHighlight>
  );
}
