import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
  ProviderGroup,
  Selection,
  SuggestedModelWithReasoningEffort,
  UserModelSelection,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  AUTO_MODEL_SELECTION,
  buildModelSelection,
  getModelKey,
  getModelWithReasoningEffortLabel,
  getSelectableReasoningEfforts,
  resolveDefaultSelection,
  SUGGESTED_PINS,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useModels } from "@app/lib/swr/models";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

interface InputBarModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
  agentId: string | null;
  lastRequestedModel: ModelSelectionType | null;
  owner: LightWorkspaceType;
  buttonSize: "xs" | "sm";
  // Which side the dropdown opens toward. Mirrors the agent picker: "top" in an
  // active conversation (input bar pinned to the bottom), "bottom" on the new
  // conversation screen where there is room below.
  side?: "top" | "bottom";
  disabled?: boolean;
  onSelectionChange?: (modelSelection: ModelSelectionType | undefined) => void;
}

export function InputBarModelPicker({
  agentModel,
  agentId,
  lastRequestedModel,
  owner,
  buttonSize,
  side = "top",
  disabled,
  onSelectionChange,
}: InputBarModelPickerProps) {
  const { hasFeature } = useFeatureFlags();
  const hasModelsPicker = hasFeature("models_picker");
  const { isDark } = useTheme();
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // The list of models is hidden while "Auto" is on.
  const [expanded, setExpanded] = useState(false);

  const [userOverride, setUserOverride] = useState<Selection | null>(null);

  // On mobile there are no nested submenus: the "More models" providers expand
  // inline below their name. This tracks the single provider currently expanded.
  const [expandedProvider, setExpandedProvider] =
    useState<ModelProviderIdType | null>(null);

  const commitSelection = (selection: UserModelSelection) => {
    const isSelectionAuto = selection.kind === "auto";
    const isDefaultAuto = defaultSelection.kind === "auto";
    const isSelectionSameModelAsAgent =
      selection.kind === "model" &&
      defaultSelection.kind === "agent" &&
      selection.model.modelId === agentModel?.modelId &&
      selection.model.providerId === agentModel?.providerId &&
      selection.effort === agentModel?.reasoningEffort;

    if ((isSelectionAuto && isDefaultAuto) || isSelectionSameModelAsAgent) {
      // show default
      setUserOverride(null);
      return;
    }
    setUserOverride(selection);
  };

  // Clear the manual override when the user switches which agent they address
  const prevAgentIdRef = useRef(agentId);
  if (agentId !== prevAgentIdRef.current) {
    prevAgentIdRef.current = agentId;
    setUserOverride(null);
    setExpanded(false);
  }

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

  const defaultSelection = useMemo(
    () => resolveDefaultSelection({ agentModel, lastRequestedModel, models }),
    [agentModel, lastRequestedModel, models]
  );

  const shown: Selection = userOverride ?? defaultSelection;
  const shownModelSelection = shown.toSend;

  // Keep the parent's send-time selection in sync. `onSelectionChange` only
  // stashes the value in a parent ref, so this triggers no parent re-render.
  useEffect(() => {
    if (!hasModelsPicker) {
      return;
    }
    onSelectionChange?.(shownModelSelection);
  }, [hasModelsPicker, onSelectionChange, shownModelSelection]);

  // Resolve the pinned combos against the workspace's actual models (skipping any
  // the workspace doesn't have or that don't support the pinned effort).
  const suggestedModelsWithEfforts = useMemo<
    SuggestedModelWithReasoningEffort[]
  >(
    () =>
      SUGGESTED_PINS.flatMap((pin) => {
        const model = models.find(
          (m) => m.providerId === pin.providerId && m.modelId === pin.modelId
        );
        if (
          !model ||
          !getAvailableReasoningEfforts(
            model.supportedReasoningEfforts
          ).includes(pin.effort)
        ) {
          return [];
        }
        return [
          {
            model,
            effort: pin.effort,
            recommendation: pin.recommendation,
          },
        ];
      }),
    [models]
  );

  const moreByProvider = useMemo<ProviderGroup[]>(() => {
    const providers = new Map<
      ModelProviderIdType,
      { model: ModelConfigurationType; efforts: ReasoningEffort[] }[]
    >();
    for (const model of models) {
      let entries = providers.get(model.providerId);
      if (!entries) {
        entries = [];
        providers.set(model.providerId, entries);
      }
      entries.push({ model, efforts: getSelectableReasoningEfforts(model) });
    }
    return Array.from(providers.entries()).map(([providerId, entries]) => ({
      providerId,
      models: entries,
    }));
  }, [models]);

  // The agent's configured default, ignoring the last-requested model: reuse
  // resolveDefaultSelection with no last-requested model, then keep only the
  // agent-model outcome.
  const agentDefault = useMemo<ModelWithReasoningEffort | null>(() => {
    const selection = resolveDefaultSelection({
      agentModel,
      lastRequestedModel: null,
      models,
    });
    return selection.kind === "agent"
      ? { model: selection.model, effort: selection.effort }
      : null;
  }, [agentModel, models]);
  // Drop the agent default from Suggested (rows are per model now, so compare
  // models only).
  const suggested = useMemo(
    () =>
      suggestedModelsWithEfforts.filter(
        (s) =>
          agentDefault?.model.modelId !== s.model.modelId ||
          agentDefault?.model.providerId !== s.model.providerId
      ),
    [suggestedModelsWithEfforts, agentDefault]
  );

  const isSearching = search.trim() !== "";

  // While searching we show a single flat list of models.
  const filteredModels = useMemo<ModelConfigurationType[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return models;
    }
    return models.filter(
      (model) =>
        model.displayName.toLowerCase().includes(q) ||
        getProviderDisplayName(model.providerId).toLowerCase().includes(q)
    );
  }, [models, search]);

  const selected: ModelWithReasoningEffort | null =
    shown.kind === "auto" ? null : { model: shown.model, effort: shown.effort };

  // Surface a user-picked model as a top "Selected" section when its row is
  // otherwise buried in a provider submenu, keeping its effort tunable from
  // the first level of the menu.
  const currentSelection = useMemo<ModelWithReasoningEffort | null>(() => {
    if (shown.kind !== "model") {
      return null;
    }
    const shownKey = getModelKey(shown.model.providerId, shown.model.modelId);
    const hasVisibleRow =
      (agentDefault &&
        getModelKey(
          agentDefault.model.providerId,
          agentDefault.model.modelId
        ) === shownKey) ||
      suggested.some(
        (s) => getModelKey(s.model.providerId, s.model.modelId) === shownKey
      );
    return hasVisibleRow ? null : { model: shown.model, effort: shown.effort };
  }, [shown, agentDefault, suggested]);

  // Auto is "on" while it is the shown selection and the list has not been
  // manually expanded for browsing. It is hidden entirely while searching.
  const isAutoOn = shown.kind === "auto" && !expanded;
  const showAuto = !isSearching;
  const showList = expanded || isSearching || shown.kind !== "auto";

  const hasResults = isSearching
    ? filteredModels.length > 0
    : !!agentDefault || suggested.length > 0 || moreByProvider.length > 0;

  // Collapse the correlated list booleans + data arrays into a single state so
  // the picker content receives one flat, exhaustively-typed prop.
  let listState: ModelPickerListState = {
    kind: "browse",
    currentSelection,
    agentDefault,
    suggested,
    moreByProvider,
  };
  if (!showList) {
    listState = { kind: "hidden" };
  } else if (isModelsLoading) {
    listState = { kind: "loading" };
  } else if (!hasResults) {
    listState = { kind: "empty" };
  } else if (isSearching) {
    listState = { kind: "search", models: filteredModels };
  }

  const auto = showAuto ? { isOn: isAutoOn } : null;

  const label = isMobile
    ? "Model"
    : `Model: ${getModelWithReasoningEffortLabel(shown)}`;

  const buttonIcon =
    isMobile && shown.kind !== "auto"
      ? getModelProviderLogo(shown.model.providerId, isDark)
      : undefined;

  const toggleAuto = () => {
    if (isAutoOn) {
      setExpanded(true);
    } else {
      commitSelection({ kind: "auto", toSend: AUTO_MODEL_SELECTION });
      setExpanded(false);
    }
  };

  if (!hasModelsPicker) {
    return null;
  }

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearch("");
          setExpanded(false);
          setExpandedProvider(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size={buttonSize}
          label={label}
          icon={buttonIcon}
          disabled={disabled}
          isSelect
        />
      </DropdownMenuTrigger>
      <ModelPickerContent
        side={side}
        search={search}
        onSearchChange={setSearch}
        listState={listState}
        auto={auto}
        selected={selected}
        onToggleAuto={toggleAuto}
        onSelectModel={(modelWithEffort: ModelWithReasoningEffort) => {
          commitSelection({
            kind: "model",
            model: modelWithEffort.model,
            effort: modelWithEffort.effort,
            toSend: buildModelSelection(
              modelWithEffort.model,
              modelWithEffort.effort
            ),
          });
        }}
        expandedProvider={expandedProvider}
        onToggleProvider={(providerId) =>
          setExpandedProvider((current) =>
            current === providerId ? null : providerId
          )
        }
      />
    </DropdownMenu>
  );
}
