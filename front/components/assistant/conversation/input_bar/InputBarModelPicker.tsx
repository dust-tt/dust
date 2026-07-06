import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  ModelLine,
  ProviderGroup,
  Selection,
  SuggestedLine,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getLineKey,
  getLineLabel,
  getSelectableReasoningEfforts,
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
import { useMemo, useRef, useState } from "react";

interface InputBarModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
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
  const [selection, setSelection] = useState<Selection>({ kind: "auto" });

  // On mobile there are no nested submenus: the "More models" providers expand
  // inline below their name. This tracks the single provider currently expanded.
  const [expandedProvider, setExpandedProvider] =
    useState<ModelProviderIdType | null>(null);

  // Commit a selection and notify the parent so it can attach (or, for "auto",
  // clear) the per-message model override on the next send. Called from the
  // user-driven handlers below and from the agent-change reset. `onSelectionChange`
  // only stashes the value in a parent ref, so calling it here — including during
  // the render-time reset — triggers no parent re-render.
  const commitSelection = (next: Selection) => {
    setSelection(next);
    onSelectionChange?.(toModelSelection(next));
  };

  // Reset to Auto when the agent changes: a per-message override should not leak
  // across agents.
  const agentModelKey = agentModel
    ? `${agentModel.providerId}/${agentModel.modelId}`
    : null;
  const prevAgentModelKeyRef = useRef(agentModelKey);
  if (agentModelKey !== prevAgentModelKeyRef.current) {
    prevAgentModelKeyRef.current = agentModelKey;
    commitSelection({ kind: "auto" });
    setExpanded(false);
  }

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

  const allLines = useMemo<ModelLine[]>(
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
  const suggestedLines = useMemo<SuggestedLine[]>(
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
    for (const line of allLines) {
      const providerId = line.model.providerId;
      let modelsMap = providers.get(providerId);
      if (!modelsMap) {
        modelsMap = new Map();
        providers.set(providerId, modelsMap);
      }
      let entry = modelsMap.get(line.model.modelId);
      if (!entry) {
        entry = { model: line.model, efforts: [] };
        modelsMap.set(line.model.modelId, entry);
      }
      entry.efforts.push(line.effort);
    }
    return Array.from(providers.entries()).map(([providerId, modelsMap]) => ({
      providerId,
      models: Array.from(modelsMap.values()),
    }));
  }, [allLines]);

  const isSearching = search.trim() !== "";

  // While searching we show a single flat list over every model/effort.
  const filteredAll = useMemo<ModelLine[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return allLines;
    }
    return allLines.filter(
      (l) =>
        getLineLabel({ model: l.model, effort: l.effort, kind: "model" })
          .toLowerCase()
          .includes(q) ||
        getProviderDisplayName(l.model.providerId).toLowerCase().includes(q)
    );
  }, [allLines, search]);

  const selectedKey =
    selection.kind === "model"
      ? getLineKey(
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

  const label = isMobile ? "Model" : `Model: ${getLineLabel(selection)}`;

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

  const hasResults = isSearching
    ? filteredAll.length > 0
    : suggestedLines.length > 0 || moreByProvider.length > 0;

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
        isModelsLoading={isModelsLoading}
        isSearching={isSearching}
        hasResults={hasResults}
        filteredAll={filteredAll}
        suggestedLines={suggestedLines}
        moreByProvider={moreByProvider}
        selectedKey={selectedKey}
        isMobile={isMobile}
        isDark={isDark}
        showAuto={showAuto}
        isAutoOn={isAutoOn}
        showList={showList}
        onToggleAuto={toggleAuto}
        onSelectLine={(line: ModelLine) =>
          commitSelection({
            kind: "model",
            model: line.model,
            effort: line.effort,
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
