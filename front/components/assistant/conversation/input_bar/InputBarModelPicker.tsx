import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { ModelPickerContent } from "@app/components/assistant/conversation/input_bar/ModelPickerContent";
import type {
  MakerGroup,
  ModelTierId,
  Selection,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  getInitialEffort,
  getModelEffortTier,
  getModelTier,
  getModelWithReasoningEffortLabel,
  isPremiumModel,
  isSameSelection,
  isTierLocked,
  resolveShownSelection,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { useModels } from "@app/lib/swr/models";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { isCreditPricedPlan } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BarFull,
  BarHalf,
  BarLow,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

const TIER_BUTTON_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

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
  const { subscription } = useAuth();
  const lockPremiumEfforts = !isCreditPricedPlan(subscription.plan);
  const { stickyModelOverride, setStickyModelOverride } =
    useContext(InputBarContext);
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const clientType = useClientType();
  const isWidthConstrained = isMobile || clientType === "extension";

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Inline-expansion state, only used on width-constrained clients.
  const [moreModelsExpanded, setMoreModelsExpanded] = useState(false);
  const [expandedMaker, setExpandedMaker] = useState<ModelMakerIdType | null>(
    null
  );

  const [userOverride, setUserOverride] = useState<Selection | null>(null);

  const { models } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

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
    setStickyModelOverride(undefined);
  }, [agentId, setStickyModelOverride]);

  const shown: Selection = userOverride ?? baseSelection;
  const shownModelSelection = shown.toSend;

  const canRevert = !isSameSelection(shown.display, agentDefault.display);

  // Keep the parent's send-time selection in sync. `onSelectionChange` only
  // stashes the value in a parent ref, so this triggers no parent re-render.
  useEffect(() => {
    if (!hasModelsPicker) {
      return;
    }
    onSelectionChange?.(shownModelSelection);
  }, [hasModelsPicker, onSelectionChange, shownModelSelection]);

  // Concrete, selectable models (meta-models are surfaced as tiers instead).
  const allModels = useMemo<ModelConfigurationType[]>(
    () =>
      models.filter(
        (model) => !isModelStreamId(model.modelId) && model.isSelectable
      ),
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

  const commit = (selection: Selection) => {
    if (isSameSelection(selection.display, agentDefault.display)) {
      // Exactly the agent default: keep no override so we defer to the agent's
      // own config (toSend undefined).
      setUserOverride(agentDefault);
      setStickyModelOverride(undefined);
      return;
    }
    setUserOverride(selection);
    setStickyModelOverride(selection.toSend);
  };

  // Picking a concrete model (or nudging its effort slider) must keep the menu
  // and its open submenus visible so the effort can still be adjusted. The
  // click briefly moves focus/pointer in a way Radix treats as an
  // interaction-outside and dismisses the (sub)menu; we record the pick time
  // and veto the close that immediately follows it (see `onOpenChange` and the
  // submenu guards in `ModelPickerMoreModels`).
  const lastModelInteractionAtMsRef = useRef(0);

  const shouldBlockDismiss = () =>
    Date.now() - lastModelInteractionAtMsRef.current < 300;

  const onSelectTier = (tierId: ModelTierId) => {
    if (isTierLocked(tierId, { lockPremiumEfforts })) {
      return;
    }
    commit({
      display: { kind: "tier", tierId },
      toSend: buildTierSelection(tierId),
    });
  };

  const onSelectModel = (model: ModelConfigurationType) => {
    if (isPremiumModel(model, { lockPremiumEfforts })) {
      return;
    }
    lastModelInteractionAtMsRef.current = Date.now();
    const effort = getInitialEffort(model, { lockPremiumEfforts });
    commit({
      display: { kind: "model", model, effort },
      toSend: buildModelSelection(model, effort),
    });
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    if (shown.display.kind !== "model") {
      return;
    }
    lastModelInteractionAtMsRef.current = Date.now();
    const { model } = shown.display;
    if (
      lockPremiumEfforts &&
      getModelEffortTier(model.modelId, effort) === "premium"
    ) {
      return;
    }
    commit({
      display: { kind: "model", model, effort },
      toSend: buildModelSelection(model, effort),
    });
  };

  const onRevert = () => {
    setUserOverride(agentDefault);
    setStickyModelOverride(undefined);
  };

  if (!hasModelsPicker) {
    return null;
  }

  const buttonIcon =
    shown.display.kind === "tier"
      ? TIER_BUTTON_ICON[shown.display.tierId]
      : getModelMakerLogo(getModelMaker(shown.display.model), isDark);

  const tooltip =
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
        setIsOpen(open);
        if (open) {
          setSearch("");
          setMoreModelsExpanded(false);
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
        search={search}
        onSearchChange={setSearch}
        isWidthConstrained={isWidthConstrained}
        moreModelsExpanded={moreModelsExpanded}
        onToggleMoreModels={() => setMoreModelsExpanded((v) => !v)}
        expandedMaker={expandedMaker}
        onToggleMaker={(makerId) =>
          setExpandedMaker((current) => (current === makerId ? null : makerId))
        }
        onSelectTier={onSelectTier}
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        onRevert={onRevert}
      />
    </DropdownMenu>
  );
}
