import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  MakerGroup,
  ModelEntry,
  ModelPickerListState,
  ModelRef,
  ModelWithReasoningEffort,
  ResolvedTier,
  SelectedModelRef,
  Selection,
  UserModelSelection,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  AUTO_MODEL_SELECTION,
  buildModelSelection,
  getMatchingTier,
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
  ModelMakerIdType,
  ModelSelectionType,
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

  // Picking a concrete model (or nudging its effort slider) must keep the menu
  // open so the effort can still be adjusted. Each model row is wrapped in a
  // tooltip trigger whose portal makes Radix treat the click as an
  // interaction-outside and dismiss the menu; we record the pick time and
  // ignore the close that immediately follows it (see `onOpenChange`).
  const lastModelSelectionAtMsRef = useRef(0);

  // True in the brief window after a model/effort pick, used to veto the
  // focus-outside dismissal that the pick triggers on the open submenus.
  const shouldBlockDismiss = () =>
    Date.now() - lastModelSelectionAtMsRef.current < 300;

  const selectModel = (modelWithEffort: ModelWithReasoningEffort) => {
    lastModelSelectionAtMsRef.current = Date.now();
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
  const defaultModel: ModelRef | null =
    !defaultTier &&
    (pureDefaultSelection.kind === "model" ||
      pureDefaultSelection.kind === "agent")
      ? {
          providerId: pureDefaultSelection.model.providerId,
          modelId: pureDefaultSelection.model.modelId,
        }
      : null;

  // Keep the parent's send-time selection in sync. `onSelectionChange` only
  // stashes the value in a parent ref, so this triggers no parent re-render.
  useEffect(() => {
    if (!hasModelsPicker) {
      return;
    }
    onSelectionChange?.(shownModelSelection);
  }, [hasModelsPicker, onSelectionChange, shownModelSelection]);

  // One entry per selectable model, carrying the reasoning efforts it supports.
  const modelEntries = useMemo<ModelEntry[]>(
    () =>
      models
        .filter(
          (model) =>
            model.modelId !== AUTO_MODEL_ID && !isModelStreamId(model.modelId)
        )
        .map((model) => ({
          model,
          efforts: getSelectableReasoningEfforts(model),
        }))
        .filter((entry) => entry.efforts.length > 0),
    [models]
  );

  const moreByMaker = useMemo<MakerGroup[]>(() => {
    const makers = new Map<ModelMakerIdType, ModelEntry[]>();
    for (const entry of modelEntries) {
      const makerId = getModelMaker(entry.model);
      const group = makers.get(makerId);
      if (group) {
        group.push(entry);
      } else {
        makers.set(makerId, [entry]);
      }
    }
    return Array.from(makers.entries()).map(([makerId, makerModels]) => ({
      makerId,
      models: makerModels,
    }));
  }, [modelEntries]);

  const tiers = useMemo<ResolvedTier[]>(() => resolveTiers(models), [models]);

  // While searching we show a single flat list of models, matched on the model
  // and maker names.
  const filteredModels = useMemo<ModelEntry[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return modelEntries;
    }
    return modelEntries.filter(
      (entry) =>
        entry.model.displayName.toLowerCase().includes(q) ||
        getModelMakerDisplayName(getModelMaker(entry.model))
          .toLowerCase()
          .includes(q)
    );
  }, [modelEntries, search]);

  const selectedModel: SelectedModelRef | null =
    shown.kind === "model" || shown.kind === "agent"
      ? {
          providerId: shown.model.providerId,
          modelId: shown.model.modelId,
          effort: shown.effort,
        }
      : null;

  // The current selection either matches a tier, or lives in the "More models"
  // list (agent defaults and any user-picked non-tier model). Auto and stream
  // selections always match a tier.
  const matchingTier = getMatchingTier(shown);
  const moreModelsSelected =
    !matchingTier && shown.kind !== "auto" && shown.kind !== "stream";
  const selectedMakerId =
    moreModelsSelected && (shown.kind === "model" || shown.kind === "agent")
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
        // Ignore the dismissal that a model/effort pick triggers, so the effort
        // slider stays reachable. The window is short enough not to swallow a
        // genuine click-outside a moment later.
        if (!open && Date.now() - lastModelSelectionAtMsRef.current < 300) {
          return;
        }
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
        shouldBlockDismiss={shouldBlockDismiss}
        listState={listState}
        selectedModel={selectedModel}
        selectedTierId={matchingTier?.id ?? null}
        onSelectTier={selectTier}
        onSelectModel={selectModel}
        canRevert={canRevert}
        onRevert={revertToDefault}
        defaultTierId={defaultTier?.id ?? null}
        defaultModel={defaultModel}
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
