import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
  ProviderGroup,
  Selection,
  SuggestedModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getModelWithReasoningEffortKey,
  getModelWithReasoningEffortLabel,
  getSelectableReasoningEfforts,
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
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

interface InputBarModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
  owner: LightWorkspaceType;
  buttonSize: "xs" | "sm";
  // Which side the dropdown opens toward. Mirrors the agent picker: "top" in an
  // active conversation (input bar pinned to the bottom), "bottom" on the new
  // conversation screen where there is room below.
  side?: "top" | "bottom";
  disabled?: boolean;
}

export function InputBarModelPicker({
  agentModel,
  owner,
  buttonSize,
  side = "top",
  disabled,
}: InputBarModelPickerProps) {
  const { hasFeature } = useFeatureFlags();
  const hasModelsPicker = hasFeature("models_picker");
  const { isDark } = useTheme();
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // The list of models is hidden while "Auto" is on.
  const [expanded, setExpanded] = useState(false);

  // The selection lives in InputBarContext so it persists across
  // conversations/messages (like the selected agent) instead of resetting when
  // the input bar remounts.
  const { selectedModelSelection: selection, setSelectedModelSelection } =
    useContext(InputBarContext);

  // On mobile there are no nested submenus: the "More models" providers expand
  // inline below their name. This tracks the single provider currently expanded.
  const [expandedProvider, setExpandedProvider] =
    useState<ModelProviderIdType | null>(null);

  const commitSelection = (next: Selection) => {
    setSelectedModelSelection(next);
  };

  // Reset to Auto when the agent's model changes: a per-message override should
  // not leak across agents. Done in an effect (not during render) because the
  // selection now lives in a parent context, and updating parent state during a
  // child's render is not allowed.
  const agentModelKey = agentModel
    ? `${agentModel.providerId}/${agentModel.modelId}`
    : null;
  const prevAgentModelKeyRef = useRef(agentModelKey);
  useEffect(() => {
    const prevAgentModelKey = prevAgentModelKeyRef.current;
    prevAgentModelKeyRef.current = agentModelKey;
    // Only reset across two concrete, different agent models. Transitions
    // to/from null (agent list still loading after a remount, or no agent
    // selected) must not wipe the persisted override.
    if (
      prevAgentModelKey !== null &&
      agentModelKey !== null &&
      prevAgentModelKey !== agentModelKey
    ) {
      setSelectedModelSelection({ kind: "auto" });
      setExpanded(false);
    }
  }, [agentModelKey, setSelectedModelSelection]);

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

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
    selection.kind === "model"
      ? getModelWithReasoningEffortKey(
          selection.model.providerId,
          selection.model.modelId,
          selection.effort
        )
      : undefined;

  // Auto is "on" while it is the committed selection and the list has not been
  // manually expanded for browsing. It is hidden entirely while searching.
  const isAutoOn = selection.kind === "auto" && !expanded;
  const showAuto = !isSearching;
  const showList = expanded || isSearching || selection.kind === "model";

  const hasResults = isSearching
    ? filteredAll.length > 0
    : suggestedModelsWithEfforts.length > 0 || moreByProvider.length > 0;

  // Collapse the correlated list booleans + data arrays into a single state so
  // the picker content receives one flat, exhaustively-typed prop.
  let listState: ModelPickerListState = {
    kind: "browse",
    suggested: suggestedModelsWithEfforts,
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
    : `Model: ${getModelWithReasoningEffortLabel(selection)}`;

  const buttonIcon =
    isMobile && selection.kind === "model"
      ? getModelProviderLogo(selection.model.providerId, isDark)
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
        onSelectModel={(modelWithEffort: ModelWithReasoningEffort) =>
          commitSelection({
            kind: "model",
            model: modelWithEffort.model,
            effort: modelWithEffort.effort,
          })
        }
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
