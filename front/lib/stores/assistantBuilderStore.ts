import { uniqueId } from "lodash";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
  BuilderScreen,
} from "@app/components/assistant_builder/types";
import { getDefaultAssistantState } from "@app/components/assistant_builder/types";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { SupportedModel } from "@app/types";
import {
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  GPT_4O_MINI_MODEL_CONFIG,
  isSupportingResponseFormat,
} from "@app/types";

import { isUpgraded } from "../plans/plan_codes";

interface AssistantBuilderStoreState {
  screen: BuilderScreen;
  builderState: AssistantBuilderState;
  assistantHandleError: string | null;
  instructionsError: string | null;
  descriptionError: string | null;
  hasAnyActionsError: boolean;
  edited: boolean;
  initialScope: "workspace" | "private";
  defaultScope: "workspace" | "private";
  defaultTemplate: FetchAssistantTemplateResponse | null;
  defaultIsEdited: boolean;
  isSavingOrDeleting: boolean;
  disableUnsavedChangesPrompt: boolean;
  actions: {
    setScreen: (screen: BuilderScreen) => void;
    setBuilderState: (builderState: AssistantBuilderState) => void;
    updateActions: (actions: AssistantBuilderActionConfiguration[]) => void;
    updateGenerationSettings: (
      generationSettings: AssistantBuilderState["generationSettings"]
    ) => void;
    updateModelSettings: (modelSettings: SupportedModel) => void;
    updateResponseFormat: (responseFormat: string | undefined) => void;
    updateInstruction: (instruction: string) => void;
    setAssistantHandleError: (error: string | null) => void;
    setInstructionsError: (error: string | null) => void;
    setDescriptionError: (error: string | null) => void;
    setHasAnyActionsError: (hasAnyActionsError: boolean) => void;
    setEdited: (edited: boolean) => void;
    setIsSavingOrDeleting: (isSavingOrDeleting: boolean) => void;
  };
}

export const createAssistantBuilderStore = (initialState: any) => {
  console.log("initialState", initialState);
  const defaultScope =
    initialState.flow === "workspace_assistants" ? "workspace" : "private";
  const initialScope = initialState.initialScope ?? defaultScope;

  const defaultIsEdited = initialState.defaultIsEdited;

  const builderState = initialState.initialBuilderState
    ? {
        ...initialState.initialBuilderState,
        generationSettings: initialState.initialBuilderState
          .generationSettings ?? {
          ...getDefaultAssistantState().generationSettings,
        },
        actions: initialState.initialBuilderState.actions.map((action) => ({
          id: uniqueId(),
          ...action,
        })),
        maxStepsPerRun:
          initialState.initialBuilderState.maxStepsPerRun ??
          getDefaultAssistantState().maxStepsPerRun,
      }
    : {
        ...getDefaultAssistantState(),
        scope: defaultScope,
        generationSettings: {
          ...getDefaultAssistantState().generationSettings,
          modelSettings: !isUpgraded(initialState.plan)
            ? GPT_4O_MINI_MODEL_CONFIG
            : CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
        },
      };

  return create<AssistantBuilderStoreState>()(
    immer(
      devtools((set) => ({
        ...initialState,
        screen: "instructions",
        defaultScope,
        initialScope,
        builderState,
        assistantHandleError: null,
        instructionsError: null,
        descriptionError: null,
        hasAnyActionsError: false,
        defaultIsEdited,
        edited: defaultIsEdited ?? false,
        isSavingOrDeleting: false,
        disableUnsavedChangesPrompt: false,
        actions: {
          setScreen: (screen: BuilderScreen) => set({ screen }),
          setBuilderState: (builderState: AssistantBuilderState) =>
            set({ builderState }),
          updateActions: (actions: AssistantBuilderActionConfiguration[]) =>
            set(
              (state) => {
                console.log("state", state);
                state.builderState.actions = actions;
              },
              undefined,
              "updateActions"
            ),
          updateInstruction: (instruction: string) =>
            set((state) => {
              state.edited = true;
              state.builderState.instructions = instruction;
            }),
          updateModelSettings: (modelSettings: SupportedModel) =>
            set((state) => {
              state.edited = true;
              state.builderState.generationSettings.modelSettings =
                modelSettings;
            }),
          updateGenerationSettings: (
            generationSettings: AssistantBuilderState["generationSettings"]
          ) =>
            set((state) => {
              state.builderState.generationSettings = generationSettings;
              state.builderState.generationSettings.responseFormat =
                isSupportingResponseFormat(
                  generationSettings.modelSettings.modelId
                )
                  ? generationSettings.responseFormat
                  : undefined;
            }),
          updateResponseFormat: (responseFormat: string | undefined) =>
            set(
              (state) => {
                console.log("responseFormat", responseFormat);
                state.edited = true;
                state.builderState.generationSettings.responseFormat =
                  responseFormat;
              },
              undefined,
              "updateResponseFormat"
            ),
          updateScope: (scope: "workspace" | "private") =>
            set(
              (state) => {
                if (state.builderState.scope !== scope) {
                  state.edited = true;
                }
                state.builderState.scope = scope;
              },
              undefined,
              "updateScope"
            ),
          setAssistantHandleError: (error: string | null) =>
            set({ assistantHandleError: error }),
          setInstructionsError: (error: string | null) =>
            set({ instructionsError: error }),
          setDescriptionError: (error: string | null) =>
            set({ descriptionError: error }),
          setHasAnyActionsError: (hasAnyActionsError: boolean) =>
            set({ hasAnyActionsError }),
          setEdited: (edited: boolean) => set({ edited }),
          setIsSavingOrDeleting: (isSavingOrDeleting: boolean) =>
            set({ isSavingOrDeleting }),
          setDisableUnsavedChangesPrompt: (
            disableUnsavedChangesPrompt: boolean
          ) => set({ disableUnsavedChangesPrompt }),
        },
      }))
    )
  );
};
