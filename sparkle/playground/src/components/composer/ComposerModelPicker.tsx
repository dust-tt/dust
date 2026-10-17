// Port of front's input bar model picker:
//   components/assistant/conversation/input_bar/InputBarModelPicker.tsx
//   components/model_picker/{ModelPicker,ModelPickerContent,ModelPickerMakersView,
//   ModelPickerModelRow,ReasoningEffortSlider,ModelPickerSelectionIndicator,ModelTierChip}.tsx
// Data fetching is replaced by the mock catalog in data/composer.ts.

import {
  Button,
  Check,
  ChevronDown,
  ChevronRight,
  Chip,
  cn,
  DoubleIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  InfoCircle,
  LinkWrapper,
  Lock01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SliderSteps,
  XClose,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

import type {
  ComposerModel,
  ModelTierId,
  ReasoningEffort,
} from "../../data/composer";
import {
  AUTO_MODELS_HINT,
  COMPOSER_MODELS,
  getModelMaker,
  MODEL_MAKERS,
  MODEL_TIERS,
  MODELS_TIER_DISPLAY_NAMES,
  REASONING_EFFORT_LABELS,
} from "../../data/composer";

export type ModelSelection =
  | { kind: "tier"; tierId: ModelTierId }
  | { kind: "model"; model: ComposerModel; effort: ReasoningEffort };

const PREMIUM_MODEL_LOCKED_TOOLTIP =
  "This option isn't available on your workspace's current plan. " +
  "Contact your administrator to upgrade.";

const AUTO_MODELS_DOC_URL = "https://docs.dust.tt/docs/models";

export function isSameSelection(a: ModelSelection, b: ModelSelection) {
  if (a.kind === "tier" && b.kind === "tier") {
    return a.tierId === b.tierId;
  }
  if (a.kind === "model" && b.kind === "model") {
    return a.model.modelId === b.model.modelId && a.effort === b.effort;
  }
  return false;
}

export function getReasoningEffortLabel(effort: ReasoningEffort) {
  return effort === "none" ? null : REASONING_EFFORT_LABELS[effort];
}

export function getModelWithReasoningEffortLabel(selection: ModelSelection) {
  if (selection.kind === "tier") {
    return MODEL_TIERS.find((t) => t.id === selection.tierId)!.name;
  }
  const effortLabel = getReasoningEffortLabel(selection.effort);
  return effortLabel
    ? `${selection.model.displayName} ${effortLabel}`
    : selection.model.displayName;
}

export function getSelectionIcon(selection: ModelSelection): ComponentType {
  return selection.kind === "tier"
    ? MODEL_TIERS.find((t) => t.id === selection.tierId)!.icon
    : getModelMaker(selection.model.makerId).logo;
}

// Efforts shown as slider stops. Non-reasoning models have none.
function getEffortStops(model: ComposerModel) {
  return model.efforts.map((effort) => ({
    effort,
    unavailabilityReason: null as "premium" | null,
  }));
}

export function getInitialEffort(model: ComposerModel): ReasoningEffort {
  return model.efforts.includes(model.defaultEffort)
    ? model.defaultEffort
    : (model.efforts[0] ?? "none");
}

// --- ModelPickerSelectionIndicator ---------------------------------------

function ModelPickerSelectionIndicator({
  onRevert,
  size = "sm",
}: {
  onRevert?: () => void;
  size?: "xs" | "sm";
}) {
  if (!onRevert) {
    return <Icon visual={Check} size={size} className="text-foreground" />;
  }

  return (
    <button
      type="button"
      aria-label="Revert to default"
      className="group/indicator flex items-center justify-center text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onRevert();
      }}
    >
      <Icon
        visual={Check}
        size={size}
        className="group-hover/indicator:hidden"
      />
      <Icon
        visual={XClose}
        size={size}
        className="hidden group-hover/indicator:block"
      />
    </button>
  );
}

// --- Degraded icons ---------------------------------------------------------

function DegradedModelIcon({
  icon,
  surface,
}: {
  icon: ComponentType;
  surface: "composer" | "menu";
}) {
  return (
    <DoubleIcon
      size="xs"
      mainIcon={icon}
      secondaryIcon={InfoCircle}
      position="top-right"
      secondaryColor="info"
      secondarySize="badge"
      {...(surface === "composer"
        ? {
            surface: "current" as const,
            className:
              "text-[oklch(98.8%_0_89.876)] dark:text-[oklch(29.4%_0.008_84.593)]",
          }
        : { surface: "overlay-background" as const })}
    />
  );
}

function DegradedInfoIcon() {
  return (
    <span className="relative flex h-5 w-5">
      <span className="absolute inset-px rounded-full bg-info-500" />
      <Icon
        visual={InfoCircle}
        size="sm"
        className="relative text-overlay-background"
      />
    </span>
  );
}

function getDegradedModelTooltip(displayName: string): string {
  return `${displayName} is unstable right now. You may want to select another model.`;
}

// --- ReasoningEffortSlider --------------------------------------------------

const MAX_LABELLED_STOPS = 3;

function ReasoningEffortSlider({
  stops,
  value,
  onChange,
}: {
  stops: { effort: ReasoningEffort; unavailabilityReason: "premium" | null }[];
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}) {
  const valueIndex = Math.max(
    stops.findIndex((stop) => stop.effort === value),
    0
  );
  const lockedSteps = stops.flatMap((stop, index) =>
    stop.unavailabilityReason !== null ? [index] : []
  );
  const lastIndex = Math.max(stops.length - 1, 1);
  const availableStops = stops.filter(
    (stop) => stop.unavailabilityReason === null
  );
  const isDisabled = availableStops.length <= 1;
  const labelsEveryStop = stops.length <= MAX_LABELLED_STOPS;

  const selectStop = (stop: (typeof stops)[number]) => {
    if (
      !isDisabled &&
      stop.unavailabilityReason === null &&
      stop.effort !== value
    ) {
      onChange(stop.effort);
    }
  };

  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <SliderSteps
        stepCount={stops.length}
        value={valueIndex}
        lockedSteps={lockedSteps}
        disabled={isDisabled}
        stepTooltips={stops.map((stop) =>
          stop.unavailabilityReason
            ? PREMIUM_MODEL_LOCKED_TOOLTIP
            : labelsEveryStop
              ? null
              : REASONING_EFFORT_LABELS[stop.effort].toLowerCase()
        )}
        onChange={(index) => {
          const next = stops[index];
          if (next) {
            selectStop(next);
          }
        }}
        ariaLabel="Reasoning effort"
      />

      <div className="relative h-4 text-xs">
        {stops.map((stop, index) => {
          const isFirst = index === 0;
          const isLast = index === stops.length - 1;
          if (
            !labelsEveryStop &&
            !isFirst &&
            !isLast &&
            stop.effort !== value
          ) {
            return null;
          }
          const buttonDisabled =
            stop.unavailabilityReason !== null || isDisabled;
          return (
            <button
              key={stop.effort}
              type="button"
              disabled={buttonDisabled}
              onClick={(e) => {
                e.stopPropagation();
                selectStop(stop);
              }}
              className={cn(
                "absolute whitespace-nowrap",
                buttonDisabled ? "cursor-not-allowed" : "cursor-pointer",
                stop.effort === value
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
                stop.unavailabilityReason !== null ? "opacity-50" : ""
              )}
              style={{
                left: `${(index / lastIndex) * 100}%`,
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {REASONING_EFFORT_LABELS[stop.effort].toLowerCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- ModelPickerModelRow ----------------------------------------------------

function ModelTierChip({
  model,
  effort,
}: {
  model: ComposerModel;
  effort: ReasoningEffort;
}) {
  const tier = model.tierByEffort[effort];
  if (!tier) {
    return null;
  }
  return <Chip size="mini" label={MODELS_TIER_DISPLAY_NAMES[tier]} />;
}

function ModelPickerModelRow({
  model,
  isSelected,
  isDefault,
  effort,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: {
  model: ComposerModel;
  isSelected: boolean;
  isDefault: boolean;
  effort: ReasoningEffort;
  onSelectModel: (model: ComposerModel) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert?: () => void;
}) {
  if (model.isLocked) {
    return (
      <DropdownMenuItem
        label={model.displayName}
        truncateText
        disabled
        tooltip={PREMIUM_MODEL_LOCKED_TOOLTIP}
        endComponent={
          <div className="flex items-center gap-2">
            <Icon visual={Lock01} size="sm" className="text-muted-foreground" />
          </div>
        }
      />
    );
  }

  const isDegraded = !!model.isDegraded;
  const effortStops = getEffortStops(model);
  const endComponent =
    isSelected || isDegraded ? (
      <div className="flex items-center gap-2">
        {isDegraded && <DegradedInfoIcon />}
        {isSelected && (
          <>
            <ModelTierChip model={model} effort={effort} />
            <ModelPickerSelectionIndicator onRevert={onRevert} />
          </>
        )}
      </div>
    ) : undefined;

  return (
    <>
      <DropdownMenuItem
        label={`${model.displayName}${isDefault ? " (Default)" : ""}`}
        truncateText
        tooltip={
          isDegraded ? getDegradedModelTooltip(model.displayName) : undefined
        }
        endComponent={endComponent}
        onClick={() => onSelectModel(model)}
        onSelect={(e) => e.preventDefault()}
      />
      {isSelected && effortStops.length > 1 && (
        <ReasoningEffortSlider
          stops={effortStops}
          value={effort}
          onChange={onChangeEffort}
        />
      )}
    </>
  );
}

// --- ModelPicker ------------------------------------------------------------

interface ComposerModelPickerProps {
  value: ModelSelection;
  agentDefault: ModelSelection;
  onChange: (selection: ModelSelection) => void;
  buttonSize: "xs" | "sm";
  side: "top" | "bottom";
  disabled?: boolean;
  showLabel?: boolean;
}

export function ComposerModelPicker({
  value: shown,
  agentDefault,
  onChange,
  buttonSize,
  side,
  disabled,
  showLabel = true,
}: ComposerModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMakersExpanded, setIsMakersExpanded] = useState(false);

  const canRevert = !isSameSelection(shown, agentDefault);
  const onRevert = canRevert ? () => onChange(agentDefault) : undefined;

  const onSelectModel = (model: ComposerModel) => {
    if (model.isLocked) {
      return;
    }
    onChange({ kind: "model", model, effort: getInitialEffort(model) });
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    if (shown.kind !== "model") {
      return;
    }
    onChange({ kind: "model", model: shown.model, effort });
  };

  const buttonIcon = getSelectionIcon(shown);
  const isDegraded = shown.kind === "model" && !!shown.model.isDegraded;
  const degradationTooltip = isDegraded
    ? getDegradedModelTooltip(shown.model.displayName)
    : null;

  const label = getModelWithReasoningEffortLabel(shown);
  const triggerLabel =
    shown.kind === "tier"
      ? MODEL_TIERS.find((t) => t.id === shown.tierId)!.name
      : shown.model.displayName;
  const effortLabel =
    shown.kind === "model"
      ? getReasoningEffortLabel(shown.effort)?.toLowerCase()
      : null;

  const agentDefaultModelId =
    agentDefault.kind === "model" ? agentDefault.model.modelId : null;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setIsMakersExpanded(false);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          className="px-2"
          variant="ghost-secondary"
          size={buttonSize}
          icon={
            degradationTooltip !== null ? (
              <DegradedModelIcon icon={buttonIcon} surface="composer" />
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
          isSelect={showLabel}
          tooltip={
            degradationTooltip ??
            (showLabel ? undefined : `Model picker: ${label}`)
          }
          aria-label={`Model picker: ${label}`}
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
        align="end"
        side={side}
      >
        <DropdownMenuLabel className="flex items-center gap-1 text-sm">
          Model tier
          <PopoverRoot>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                icon={InfoCircle}
                className="-my-1 text-muted-foreground"
                aria-label="About model tiers"
                onClick={(e) => e.stopPropagation()}
              />
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              className="w-64 p-3"
              mountPortal={false}
            >
              <div className="text-xs text-muted-foreground">
                {AUTO_MODELS_HINT}{" "}
                <LinkWrapper
                  href={AUTO_MODELS_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline"
                >
                  Learn more
                </LinkWrapper>
              </div>
            </PopoverContent>
          </PopoverRoot>
        </DropdownMenuLabel>

        {MODEL_TIERS.map((tier) => {
          const isSelected = shown.kind === "tier" && shown.tierId === tier.id;
          return (
            <DropdownMenuItem
              key={tier.id}
              icon={tier.icon}
              label={tier.name}
              className="text-foreground"
              endComponent={
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    {tier.resolvedLabel}
                  </span>
                  {isSelected && (
                    <ModelPickerSelectionIndicator
                      onRevert={onRevert}
                      size="xs"
                    />
                  )}
                </div>
              }
              onClick={() => onChange({ kind: "tier", tierId: tier.id })}
              onSelect={(e) => e.preventDefault()}
            />
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          label="More models"
          endComponent={
            <Icon
              visual={isMakersExpanded ? ChevronDown : ChevronRight}
              size="xs"
              className="text-muted-foreground"
            />
          }
          onClick={() => setIsMakersExpanded((v) => !v)}
          onSelect={(e) => e.preventDefault()}
        />

        {isMakersExpanded &&
          MODEL_MAKERS.map((maker) => {
            const models = COMPOSER_MODELS.filter(
              (m) => m.makerId === maker.id
            );
            if (models.length === 0) {
              return null;
            }
            const hasDegradedModel = models.some((m) => m.isDegraded);
            return (
              <DropdownMenuSub key={maker.id}>
                <DropdownMenuSubTrigger
                  label={maker.name}
                  icon={
                    hasDegradedModel ? (
                      <DegradedModelIcon icon={maker.logo} surface="menu" />
                    ) : (
                      maker.logo
                    )
                  }
                />
                <DropdownMenuSubContent className="w-64">
                  {models.map((model) => {
                    const isSelected =
                      shown.kind === "model" &&
                      shown.model.modelId === model.modelId;
                    return (
                      <ModelPickerModelRow
                        key={model.modelId}
                        model={model}
                        isSelected={isSelected}
                        isDefault={agentDefaultModelId === model.modelId}
                        effort={
                          isSelected && shown.kind === "model"
                            ? shown.effort
                            : getInitialEffort(model)
                        }
                        onSelectModel={onSelectModel}
                        onChangeEffort={onChangeEffort}
                        onRevert={isSelected ? onRevert : undefined}
                      />
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
