import { DegradedModelIcon } from "@app/components/model_picker/DegradedModelIcon";
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
  ModelPickerSelectionModel,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  DEGRADED_MODEL_TOOLTIP,
  getInitialEffort,
  getModelTier,
  getModelWithReasoningEffortLabel,
  getReasoningEffortLabel,
  getTierLockReason,
  isPremiumModel,
  isSameSelection,
  resolveShownSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { useModelPickerMenuState } from "@app/components/model_picker/useModelPickerMenuState";
import { useModelPickerModels } from "@app/components/model_picker/useModelPickerModels";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useClientType } from "@app/lib/context/clientType";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
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
  // Appends the dropdown chevron to the trigger. Only meaningful alongside
  // `showLabel`: icon-only triggers stay a single glyph.
  showDropdownArrow?: boolean;
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
  showDropdownArrow = false,
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
  const clientType = useClientType();

  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);

  const [userOverride, setUserOverride] = useState<Selection | null>(null);

  const {
    modelProps,
    models,
    streamModels,
    lockPremiumEfforts,
    degradedModelIds,
  } = useModelPickerModels({ owner });
  const { menuStateProps, resetMenu } = useModelPickerMenuState();

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
    resetMenu();
    if (trackingSurface) {
      trackModelPickerOpen({ surface: trackingSurface, clientType });
    }
  };

  if (openApiRef) {
    openApiRef.current = openMenu;
  }

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
    const effort = getInitialEffort(model, { lockPremiumEfforts });
    commit(
      {
        display: { kind: "model", model, effort },
        toSend: buildModelSelection(model, effort),
      },
      "model"
    );
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    if (shown.display.kind !== "model") {
      return;
    }
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

  const selection: ModelPickerSelectionModel = {
    selected: [shown.display],
    agentDefault: agentDefault.display,
    onRevert: canRevert ? onRevert : undefined,
  };

  const buttonIcon =
    shown.display.kind === "tier"
      ? MODEL_TIER_ICON[shown.display.tierId]
      : getModelMakerLogo(getModelMaker(shown.display.model), isDark);

  const isShownModelDegraded =
    shown.display.kind === "model" &&
    degradedModelIds.has(shown.display.model.modelId);

  // Model name and reasoning effort read as one string for the tooltip and the
  // accessible name, but the visible trigger splits the effort into its own
  // chip so it reads as a modifier rather than part of the model's name.
  const label = getModelWithReasoningEffortLabel(shown.display);

  const triggerLabel =
    shown.display.kind === "tier"
      ? getModelTier(shown.display.tierId).name
      : shown.display.model.displayName;

  const effortLabel =
    shown.display.kind === "model"
      ? getReasoningEffortLabel(shown.display.effort)
      : null;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
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
          icon={
            isShownModelDegraded ? (
              <DegradedModelIcon icon={buttonIcon} />
            ) : (
              buttonIcon
            )
          }
          label={showLabel ? triggerLabel : undefined}
          iconRight={
            showLabel && effortLabel ? (
              <Chip
                size="mini"
                label={effortLabel}
                className="bg-primary-150"
              />
            ) : undefined
          }
          isSelect={showLabel && showDropdownArrow}
          tooltip={
            isShownModelDegraded
              ? DEGRADED_MODEL_TOOLTIP
              : showLabel
                ? undefined
                : `Model picker: ${label}`
          }
          aria-label={`Model picker: ${label}`}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <ModelPickerContent
        {...modelProps}
        {...menuStateProps}
        side={side}
        selection={selection}
        onSelectTier={onSelectTier}
        onSelectModel={onSelectModel}
        onChangeEffort={(_, effort) => onChangeEffort(effort)}
      />
    </DropdownMenu>
  );
}
