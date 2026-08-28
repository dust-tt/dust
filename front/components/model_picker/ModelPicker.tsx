import { ModelPickerContent } from "@app/components/model_picker/ModelPickerContent";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type {
  ModelPickerSelectTrigger,
  ModelPickerSurface,
} from "@app/components/model_picker/modelPickerTracking";
import {
  trackModelPickerOpen,
  trackModelPickerSelect,
} from "@app/components/model_picker/modelPickerTracking";
import type {
  MakerGroup,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  getInitialEffort,
  getModelTier,
  getModelWithReasoningEffortLabel,
  getTierLockReason,
  isPremiumModel,
  isSameSelection,
  resolveShownSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { useModels } from "@app/lib/swr/models";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { isCreditPricedPlan } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
  agentId: string | null;
  lastRequestedModel: ModelSelectionType | null;
  owner: LightWorkspaceType;
  buttonVariant: "outline" | "ghost-secondary";
  buttonSize: "xs" | "sm";
  showLabel: boolean;
  // Which side the dropdown opens toward. Mirrors the agent picker: "top" in an
  // active conversation (input bar pinned to the bottom), "bottom" on the new
  // conversation screen where there is room below.
  side?: "top" | "bottom";
  disabled?: boolean;
  // Read-at-submit sink. The picker writes the current toSend here (including
  // derived changes like agent switches); never triggers a parent re-render.
  selectionRef?: MutableRefObject<ModelSelectionType | undefined>;
  // Fired only on intentional user picks / revert — safe to setState.
  onSelectionChange?: (modelSelection: ModelSelectionType | undefined) => void;
  stickyModelOverride?: ModelSelectionType | undefined;
  setStickyModelOverride?: (
    modelSelection: ModelSelectionType | undefined
  ) => void;
  // Lets keyboard `/` Pick model commit through the same path as the button picker.
  commitApiRef?: MutableRefObject<((selection: Selection) => void) | null>;
  // Lets components outside the input bar (e.g. the sidebar banner) open the menu.
  openApiRef?: MutableRefObject<(() => void) | null>;
  // When set, emits `assistant:model_picker:*` analytics tagged with this
  // surface. Consumers that don't pass it (e.g. the agent builder) are not
  // tracked.
  trackingSurface?: ModelPickerSurface;
}

export function ModelPicker({
  agentModel,
  agentId,
  lastRequestedModel,
  owner,
  buttonVariant,
  buttonSize,
  showLabel,
  side = "top",
  disabled,
  selectionRef,
  onSelectionChange,
  stickyModelOverride,
  setStickyModelOverride,
  commitApiRef,
  openApiRef,
  trackingSurface,
}: ModelPickerProps) {
  const { hasFeature } = useFeatureFlags();
  const clientType = useClientType();
  const { subscription } = useAuth();
  const canSelectPremiumModels =
    isCreditPricedPlan(subscription.plan) ||
    subscription.plan.hasAdvancedModelAccess ||
    hasFeature("claude_4_5_opus_feature");
  const lockPremiumEfforts = !canSelectPremiumModels;

  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [isMakersExpanded, setIsMakersExpanded] = useState(false);
  const [activeMaker, setActiveMaker] = useState<ModelMakerIdType | null>(null);

  const [userOverride, setUserOverride] = useState<Selection | null>(null);

  const { models, streams } = useModels({ owner });

  const { shown: baseSelection, agentDefault } = useMemo(
    () =>
      resolveShownSelection({
        agentModel,
        lastRequestedModel,
        sessionSticky: stickyModelOverride,
        models,
      }),
    [agentModel, lastRequestedModel, stickyModelOverride, models]
  );

  // When the user switches which agent they address, discard any model override
  // so the picker falls back to the newly-selected agent's own default.
  const prevAgentIdRef = useRef(agentId);
  useEffect(() => {
    if (agentId === prevAgentIdRef.current) {
      return;
    }
    prevAgentIdRef.current = agentId;
    setUserOverride(null);
    setStickyModelOverride?.(undefined);
  }, [agentId, setStickyModelOverride]);

  const shown: Selection = userOverride ?? baseSelection;
  const shownModelSelection = shown.toSend;

  // Keep the send-time ref current — including agent switches / sticky
  // resolution where the user didn't pick anything. Mutating a ref during
  // render is fine and avoids any parent re-render.
  if (selectionRef) {
    selectionRef.current = shownModelSelection;
  }

  const canRevert = !isSameSelection(shown.display, agentDefault.display);

  // Concrete, selectable models (meta-models are surfaced as tiers instead).
  const allModels = useMemo<ModelConfigurationType[]>(
    () =>
      models.filter(
        (model) => !isModelStreamId(model.modelId) && model.isSelectable
      ),
    [models]
  );

  // Meta-models backing the tier rows: their `isSelectable` tells whether the
  // member's model-tier cap allows the stream at all.
  const streamModels = useMemo(
    () => models.filter((model) => isModelStreamId(model.modelId)),
    [models]
  );

  // Group models by maker, preserving first-seen order of both makers and
  // models within each maker.
  const makerGroups = useMemo<MakerGroup[]>(() => {
    const groups = new Map<ModelMakerIdType, ModelConfigurationType[]>();
    for (const model of allModels) {
      const makerId = getModelMaker(model);
      const existing = groups.get(makerId);
      if (existing) {
        existing.push(model);
      } else {
        groups.set(makerId, [model]);
      }
    }
    return Array.from(groups.entries()).map(([makerId, makerModels]) => ({
      makerId,
      models: makerModels,
    }));
  }, [allModels]);

  const commit = (
    selection: Selection,
    // What the user did to reach this selection. Defaults from the selection
    // shape so the keyboard `/` pick path (which calls `commit` directly via
    // `commitApiRef`) is still tracked with a sensible trigger.
    trigger: ModelPickerSelectTrigger = selection.display.kind === "tier"
      ? "tier"
      : "model"
  ) => {
    if (isSameSelection(selection.display, agentDefault.display)) {
      // Exactly the agent default: keep no override so we defer to the agent's
      // own config (toSend undefined).
      setStickyModelOverride?.(undefined);
    } else {
      setStickyModelOverride?.(selection.toSend);
    }
    setUserOverride(selection);
    onSelectionChange?.(selection.toSend);

    if (trackingSurface) {
      trackModelPickerSelect({
        surface: trackingSurface,
        clientType,
        display: selection.display,
        trigger,
      });
    }
  };

  if (commitApiRef) {
    commitApiRef.current = commit;
  }

  // Opening from the button and opening programmatically (sidebar banner) must
  // reset the menu's transient state and emit the same `open` event, so both go
  // through here rather than touching `setIsOpen` directly.
  const openMenu = () => {
    setIsOpen(true);
    setSearch("");
    setIsMakersExpanded(false);
    setActiveMaker(null);
    if (trackingSurface) {
      trackModelPickerOpen({ surface: trackingSurface, clientType });
    }
  };

  if (openApiRef) {
    openApiRef.current = openMenu;
  }

  // Picking a concrete model (or nudging its effort slider) must keep the menu
  // visible so the effort can still be adjusted. The click briefly moves
  // focus/pointer in a way Radix treats as an interaction-outside and
  // dismisses the menu; we record the pick time and veto the close that
  // immediately follows it (see `onOpenChange` below).
  const lastModelInteractionAtMsRef = useRef(0);

  const shouldBlockDismiss = () =>
    Date.now() - lastModelInteractionAtMsRef.current < 300;

  const onSelectTier = (tierId: ModelTierId) => {
    if (getTierLockReason(tierId, { lockPremiumEfforts, streamModels })) {
      return;
    }
    commit(
      {
        display: { kind: "tier", tierId },
        toSend: buildTierSelection(tierId),
      },
      "tier"
    );
  };

  const onSelectModel = (model: ModelConfigurationType) => {
    if (isPremiumModel(model, { lockPremiumEfforts })) {
      return;
    }
    lastModelInteractionAtMsRef.current = Date.now();
    const effort = getInitialEffort(model, { lockPremiumEfforts });
    commit(
      {
        display: { kind: "model", model, effort },
        toSend: buildModelSelection(model, effort),
      },
      "model"
    );
  };

  const onToggleMakers = () => {
    setIsMakersExpanded((expanded) => !expanded);
    setActiveMaker(null);
    setSearch("");
  };

  const onSelectMaker = (makerId: ModelMakerIdType) => {
    setActiveMaker(makerId);
  };

  const onBack = () => {
    setActiveMaker(null);
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    if (shown.display.kind !== "model") {
      return;
    }
    lastModelInteractionAtMsRef.current = Date.now();
    const { model } = shown.display;
    if (
      lockPremiumEfforts &&
      getTierForModel(model.modelId, effort) === "premium"
    ) {
      return;
    }
    commit(
      {
        display: { kind: "model", model, effort },
        toSend: buildModelSelection(model, effort),
      },
      "reasoning_effort"
    );
  };

  const onRevert = () => {
    setUserOverride(agentDefault);
    setStickyModelOverride?.(undefined);
    onSelectionChange?.(undefined);

    if (trackingSurface) {
      trackModelPickerSelect({
        surface: trackingSurface,
        clientType,
        display: agentDefault.display,
        trigger: "revert",
      });
    }
  };

  const buttonIcon =
    shown.display.kind === "tier"
      ? MODEL_TIER_ICON[shown.display.tierId]
      : getModelMakerLogo(getModelMaker(shown.display.model), isDark);

  const label =
    shown.display.kind === "tier"
      ? getModelTier(shown.display.tierId).name
      : getModelWithReasoningEffortLabel(shown.display);

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        // Ignore the dismissal that a model/effort pick triggers, so the menu
        // stays open. The window is short enough not to swallow a genuine
        // click-outside a moment later.
        if (!open && shouldBlockDismiss()) {
          return;
        }
        if (open) {
          openMenu();
        } else {
          setIsOpen(false);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          className="px-2"
          variant={buttonVariant}
          size={buttonSize}
          icon={buttonIcon}
          label={showLabel ? label : undefined}
          tooltip={showLabel ? undefined : `Model picker: ${label}`}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <ModelPickerContent
        side={side}
        shouldBlockDismiss={shouldBlockDismiss}
        shown={shown}
        agentDefault={agentDefault}
        canRevert={canRevert}
        lockPremiumEfforts={lockPremiumEfforts}
        makerGroups={makerGroups}
        allModels={allModels}
        streamModels={streamModels}
        streams={streams}
        search={search}
        onSearchChange={setSearch}
        isMakersExpanded={isMakersExpanded}
        onToggleMakers={onToggleMakers}
        activeMaker={activeMaker}
        onSelectMaker={onSelectMaker}
        onBack={onBack}
        onSelectTier={onSelectTier}
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        onRevert={onRevert}
      />
    </DropdownMenu>
  );
}
