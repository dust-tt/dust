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
  getModelWithReasoningEffortKey,
  getModelWithReasoningEffortLabel,
  getSelectableReasoningEfforts,
  resolveAgentDefaultModel,
  resolveDefaultSelection,
  SUGGESTED_PINS,
  toModelSelection,
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
    const isAutoSelection = selection.kind === "auto";
    const isAutoDefaultSelection = defaultSelection.kind === "auto";
    const isSameModelSelection =
      selection.kind === "model" &&
      defaultSelection.kind !== "auto" &&
      selection.model === defaultSelection.model &&
      selection.effort === defaultSelection.effort;

    if ((isAutoSelection && isAutoDefaultSelection) || isSameModelSelection) {
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

  // Derived picker default (see resolveDefaultSelection). Recomputes as the
  // agent, the last message and the model list load in.
  const defaultSelection = useMemo(
    () => resolveDefaultSelection({ agentModel, lastRequestedModel, models }),
    [agentModel, lastRequestedModel, models]
  );

  // What the picker shows: the manual override if set, else the derived default.
  const shown: Selection = userOverride ?? defaultSelection;
  const shownModelSelection = useMemo(() => toModelSelection(shown), [shown]);

  // Keep the parent's send-time selection in sync with whatever the picker
  // shows — including the derived default the user never explicitly picked (so a
  // reload reuses the last message's model). `onSelectionChange` only stashes
  // the value in a parent ref, so this triggers no parent re-render.
  useEffect(() => {
    if (!hasModelsPicker) {
      return;
    }
    onSelectionChange?.(shownModelSelection);
  }, [hasModelsPicker, onSelectionChange, shownModelSelection]);

  const allModelsWithEfforts = useMemo<ModelWithReasoningEffort[]>(
    () =>
      models.flatMap((model) =>
        getSelectableReasoningEfforts(model).map((effort) => ({
          model,
          effort,
        }))
      ),
    [models]
  );

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
      Map<string, { model: ModelConfigurationType; efforts: ReasoningEffort[] }>
    >();
    for (const modelWithEffort of allModelsWithEfforts) {
      const providerId = modelWithEffort.model.providerId;
      let modelsMap = providers.get(providerId);
      if (!modelsMap) {
        modelsMap = new Map();
        providers.set(providerId, modelsMap);
      }
      let entry = modelsMap.get(modelWithEffort.model.modelId);
      if (!entry) {
        entry = { model: modelWithEffort.model, efforts: [] };
        modelsMap.set(modelWithEffort.model.modelId, entry);
      }
      entry.efforts.push(modelWithEffort.effort);
    }
    return Array.from(providers.entries()).map(([providerId, modelsMap]) => ({
      providerId,
      models: Array.from(modelsMap.values()),
    }));
  }, [allModelsWithEfforts]);

  const agentDefault = useMemo(
    () => resolveAgentDefaultModel({ agentModel, models }),
    [agentModel, models]
  );
  const agentDefaultKey = agentDefault
    ? getModelWithReasoningEffortKey(
        agentDefault.model.providerId,
        agentDefault.model.modelId,
        agentDefault.effort
      )
    : null;

  // Drop the agent default from Suggested
  const suggested = useMemo(
    () =>
      agentDefaultKey
        ? suggestedModelsWithEfforts.filter(
            (s) =>
              getModelWithReasoningEffortKey(
                s.model.providerId,
                s.model.modelId,
                s.effort
              ) !== agentDefaultKey
          )
        : suggestedModelsWithEfforts,
    [suggestedModelsWithEfforts, agentDefaultKey]
  );

  const isSearching = search.trim() !== "";

  // While searching we show a single flat list over every model/effort.
  const filteredAll = useMemo<ModelWithReasoningEffort[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return allModelsWithEfforts;
    }
    return allModelsWithEfforts.filter(
      (modelWithEffort) =>
        getModelWithReasoningEffortLabel({
          model: modelWithEffort.model,
          effort: modelWithEffort.effort,
          kind: "model",
        })
          .toLowerCase()
          .includes(q) ||
        getProviderDisplayName(modelWithEffort.model.providerId)
          .toLowerCase()
          .includes(q)
    );
  }, [allModelsWithEfforts, search]);

  const selectedKey =
    shown.kind === "auto"
      ? undefined
      : getModelWithReasoningEffortKey(
          shown.model.providerId,
          shown.model.modelId,
          shown.effort
        );

  // Auto is "on" while it is the shown selection and the list has not been
  // manually expanded for browsing. It is hidden entirely while searching.
  const isAutoOn = shown.kind === "auto" && !expanded;
  const showAuto = !isSearching;
  const showList = expanded || isSearching || shown.kind !== "auto";

  const hasResults = isSearching
    ? filteredAll.length > 0
    : !!agentDefault || suggested.length > 0 || moreByProvider.length > 0;

  // Collapse the correlated list booleans + data arrays into a single state so
  // the picker content receives one flat, exhaustively-typed prop.
  let listState: ModelPickerListState = {
    kind: "browse",
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
    listState = { kind: "search", models: filteredAll };
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
      commitSelection({ kind: "auto" });
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
        selectedKey={selectedKey}
        onToggleAuto={toggleAuto}
        onSelectModel={(modelWithEffort: ModelWithReasoningEffort) => {
          commitSelection({
            kind: "model",
            model: modelWithEffort.model,
            effort: modelWithEffort.effort,
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
