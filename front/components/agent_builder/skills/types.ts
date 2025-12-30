import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { TemplateActionPreset } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

type SheetStateType =
  | "closed"
  | "selection"
  | "space-selection"
  | "info"
  | "knowledge"
  | "configuration";

type SheetStateBase<TState extends SheetStateType> = {
  state: TState;
};

/**
 * Extended base for states that support new/edit mode.
 * - index: null → creating new item
 * - index: number → editing existing item at that index
 */
type EditableSheetStateBase<TState extends SheetStateType> =
  SheetStateBase<TState> & {
    index: number | null;
  };

export type ClosedState = SheetStateBase<"closed">;
export type SelectionState = SheetStateBase<"selection">;

export type InfoState<
  TKind extends "skill" | "tool",
  TCapability,
> = SheetStateBase<"info"> & {
  kind: TKind;
  capability: TCapability;
  hasPreviousPage: boolean;
};

/**
 * Capabilities sheet: space selection page for skills.
 */
export type SpaceSelectionState = SheetStateBase<"space-selection"> & {
  capability: SkillType;
};

/**
 * Capabilities sheet: tool configuration/edit page.
 */
export type ConfigurationState = EditableSheetStateBase<"configuration"> & {
  capability: BuilderAction;
  mcpServerView: MCPServerViewTypeWithLabel;
};

/**
 * Knowledge configuration sheet.
 */
export type KnowledgeState = EditableSheetStateBase<"knowledge"> & {
  action: BuilderAction;
  presetData?: TemplateActionPreset;
};

export type CapabilitiesSheetState =
  | SelectionState
  | InfoState<"skill", SkillWithRelationsType>
  | InfoState<"tool", BuilderAction>
  | SpaceSelectionState
  | ConfigurationState;

/**
 * Discriminated union for sheet state.
 * Only one sheet/page can be active at a time, enforced by TypeScript.
 */
export type SheetState = ClosedState | CapabilitiesSheetState | KnowledgeState;

/**
 * Check if the capabilities sheet is open (any capabilities page).
 */
export function isCapabilitiesSheetOpen(
  state: SheetState
): state is CapabilitiesSheetState {
  return state.state !== "closed" && state.state !== "knowledge";
}

/**
 * Check if in tool configuration state (new or edit).
 */
export function isConfigurationState(
  state: SheetState
): state is ConfigurationState {
  return state.state === "configuration";
}
