import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  MakerGroup,
  ModelPickerListState,
  ModelWithReasoningEffort,
  ResolvedTier,
  Selection,
  UserModelSelection,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  AUTO_MODEL_SELECTION,
  buildModelSelection,
  getMatchingTier,
  getModelWithReasoningEffortKey,
  getModelWithReasoningEffortLabel,
  getSelectableReasoningEfforts,
  getSelectionIdentityKey,
  resolveDefaultSelection,
  resolveTiers,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useModels } from "@app/lib/swr/models";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  AUTO_MODEL_ID,
  isModelStreamId,
} from "@app/types/assistant/models/auto";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import type { ButtonIconType } from "@dust-tt/sparkle";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

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
  const { stickyModelOverride, setStickyModelOverride } =
    useContext(InputBarContext);
  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [userOverride, setUserOverride] = useState<Selection | null>(null);

  // On width-constrained clients (mobile, extension) there are no nested
  // submenus: the "More models" section and its makers expand inline.
  const [isMoreModelsExpanded, setIsMoreModelsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  // Clear the manual override when the user switches which agent they address.
  const prevAgentIdRef = useRef(agentId);
  if (agentId !== prevAgentIdRef.current) {
    prevAgentIdRef.current = agentId;
    setUserOverride(null);
  }

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

  const defaultSelection = useMemo(
    () =>
      resolveDefaultSelection({
        agentModel,
        lastRequestedModel,
        sessionSticky: stickyModelOverride,
        models,
      }),
    [agentModel, lastRequestedModel, stickyModelOverride, models]
  );

  const shown: Selection = userOverride ?? defaultSelection;
  const shownModelSelection = shown.toSend;

  const commitSelection = (selection: UserModelSelection) => {
    const isSameAsAgentDefault =
      defaultSelection.kind === "agent" &&
      selection.kind === "model" &&
      selection.model.modelId === agentModel?.modelId &&
      selection.model.providerId === agentModel?.providerId &&
      selection.effort === agentModel?.reasoningEffort;

    if (isSameAsAgentDefault) {
      // Show the agent default and clear the override.
      setUserOverride(null);
      setStickyModelOverride(undefined);
      return;
    }
    setUserOverride(selection);
    setStickyModelOverride(selection.toSend);
  };

  const selectTier = (resolved: ResolvedTier) => {
    const { selection } = resolved.tier;
    if (selection.kind === "stream") {
      commitSelection({
        kind: "stream",
        streamId: selection.streamId,
        toSend: resolved.toSend,
      });
    } else if (resolved.modelWithEffort) {
      const { model, effort } = resolved.modelWithEffort;
      commitSelection({
        kind: "model",
        model,
        effort,
        toSend: resolved.toSend,
      });
    } else {
      commitSelection({ kind: "auto", toSend: AUTO_MODEL_SELECTION });
    }
  };

  const selectModel = (modelWithEffort: ModelWithReasoningEffort) => {
    commitSelection({
      kind: "model",
      model: modelWithEffort.model,
      effort: modelWithEffort.effort,
      toSend: buildModelSelection(
        modelWithEffort.model,
        modelWithEffort.effort
      ),
    });
  };

  // The selection we revert to: the agent default (or Auto), ignoring any user
  // or sticky override. Reverting clears both, landing back here.
  const pureDefaultSelection = useMemo(
    () =>
      resolveDefaultSelection({
        agentModel,
        lastRequestedModel,
        sessionSticky: null,
        models,
      }),
    [agentModel, lastRequestedModel, models]
  );

  // There is something to revert whenever the shown selection differs from the
  // default.
  const canRevert =
    getSelectionIdentityKey(shown) !==
    getSelectionIdentityKey(pureDefaultSelection);

  const revertToDefault = () => {
    setUserOverride(null);
    setStickyModelOverride(undefined);
  };

  // Which rows carry the "(Default)" marker. When the default maps to a tier we
  // mark that tier; otherwise we mark its model line in "More models".
  const defaultTier = getMatchingTier(pureDefaultSelection);
  const defaultModelKey =
    !defaultTier && pureDefaultSelection.kind !== "auto"
      ? getSelectionIdentityKey(pureDefaultSelection)
      : undefined;

  // Keep the parent's send-time selection in sync. `onSelectionChange` only
  // stashes the value in a parent ref, so this triggers no parent re-render.
  useEffect(() => {
    if (!hasModelsPicker) {
      return;
    }
    onSelectionChange?.(shownModelSelection);
  }, [hasModelsPicker, onSelectionChange, shownModelSelection]);

  const allModelsWithEfforts = useMemo<ModelWithReasoningEffort[]>(
    () =>
      models
        .filter(
          (model) =>
            model.modelId !== AUTO_MODEL_ID && !isModelStreamId(model.modelId)
        )
        .flatMap((model) =>
          getSelectableReasoningEfforts(model).map((effort) => ({
            model,
            effort,
          }))
        ),
    [models]
  );

  const moreByMaker = useMemo<MakerGroup[]>(() => {
    const makers = new Map<
      ModelMakerIdType,
      Map<string, { model: ModelConfigurationType; efforts: ReasoningEffort[] }>
    >();
    for (const modelWithEffort of allModelsWithEfforts) {
      const makerId = getModelMaker(modelWithEffort.model);
      let modelsMap = makers.get(makerId);
      if (!modelsMap) {
        modelsMap = new Map();
        makers.set(makerId, modelsMap);
      }
      let entry = modelsMap.get(modelWithEffort.model.modelId);
      if (!entry) {
        entry = { model: modelWithEffort.model, efforts: [] };
        modelsMap.set(modelWithEffort.model.modelId, entry);
      }
      entry.efforts.push(modelWithEffort.effort);
    }
    return Array.from(makers.entries()).map(([makerId, modelsMap]) => ({
      makerId,
      models: Array.from(modelsMap.values()),
    }));
  }, [allModelsWithEfforts]);

  const tiers = useMemo<ResolvedTier[]>(() => resolveTiers(models), [models]);

  // While searching we show a single flat list over every model/effort.
  const filteredModels = useMemo<ModelWithReasoningEffort[]>(() => {
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
        getModelMakerDisplayName(getModelMaker(modelWithEffort.model))
          .toLowerCase()
          .includes(q)
    );
  }, [allModelsWithEfforts, search]);

  const selectedKey =
    shown.kind === "auto" || shown.kind === "stream"
      ? undefined
      : getModelWithReasoningEffortKey(
          shown.model.providerId,
          shown.model.modelId,
          shown.effort
        );

  // The current selection either matches a tier, or lives in the "More models"
  // list (agent defaults and any user-picked non-tier model). Auto and stream
  // selections always match a tier.
  const matchingTier = getMatchingTier(shown);
  const moreModelsSelected =
    !matchingTier && shown.kind !== "auto" && shown.kind !== "stream";
  const selectedMakerId =
    moreModelsSelected && shown.kind === "model"
      ? getModelMaker(shown.model)
      : null;

  const hasResults = tiers.length > 0 || moreByMaker.length > 0;

  let listState: ModelPickerListState = {
    kind: "ready",
    tiers,
    moreByMaker,
  };
  if (isModelsLoading) {
    listState = { kind: "loading" };
  } else if (!hasResults) {
    listState = { kind: "empty" };
  }

  // Icon-only trigger: the tier's star when the selection is a tier, otherwise
  // the model maker's logo.
  const buttonIcon: ButtonIconType | undefined = matchingTier
    ? matchingTier.icon
    : shown.kind === "model" || shown.kind === "agent"
      ? getModelMakerLogo(getModelMaker(shown.model), isDark)
      : undefined;

  const tooltip = matchingTier
    ? matchingTier.name
    : getModelWithReasoningEffortLabel(shown);

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
          setIsMoreModelsExpanded(false);
          setExpandedMaker(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          className="px-2"
          variant="ghost-secondary"
          size={buttonSize}
          icon={buttonIcon}
          tooltip={tooltip}
          disabled={disabled}
          isSelect
        />
      </DropdownMenuTrigger>
      <ModelPickerContent
        side={side}
        listState={listState}
        selectedKey={selectedKey}
        selectedTierId={matchingTier?.id ?? null}
        onSelectTier={selectTier}
        onSelectModel={selectModel}
        canRevert={canRevert}
        onRevert={revertToDefault}
        defaultTierId={defaultTier?.id ?? null}
        defaultModelKey={defaultModelKey}
        search={search}
        onSearchChange={setSearch}
        filteredModels={filteredModels}
        moreModelsSelected={moreModelsSelected}
        selectedMakerId={selectedMakerId}
        expandedMaker={expandedMaker}
        onToggleMaker={(makerId) =>
          setExpandedMaker((current) => (current === makerId ? null : makerId))
        }
        isMoreModelsExpanded={isMoreModelsExpanded}
        onToggleMoreModels={() => setIsMoreModelsExpanded((v) => !v)}
      />
    </DropdownMenu>
  );
}
