import {
  Button,
  Check,
  ChevronDown,
  ChevronRight,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hoverable,
  Icon,
  InfoCircle,
  Lock01,
  Popover,
  RefreshCw02,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  DEFAULT_TIER_ID,
  getModelById,
  MODEL_TIERS,
  type ModelMaker,
  type ModelTierId,
  mockModels,
  REASONING_EFFORT_LABELS,
  REASONING_EFFORTS,
  type ReasoningEffort,
  TIER_LOCK_TOOLTIPS,
} from "./data";
import { ValueMenu } from "./ValueMenu";

export type ModelSelection = {
  /** A tier, or a specific model picked under "More models". */
  tierId: ModelTierId | null;
  modelId: string;
  effort: ReasoningEffort;
};

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  tierId: DEFAULT_TIER_ID,
  modelId: MODEL_TIERS.find((tier) => tier.id === DEFAULT_TIER_ID)!.modelId,
  effort: getModelById(
    MODEL_TIERS.find((tier) => tier.id === DEFAULT_TIER_ID)!.modelId
  ).defaultEffort,
};

const MAKERS: ModelMaker[] = ["Anthropic", "OpenAI", "Google", "Mistral"];

/**
 * Reasoning effort for a specifically chosen model: only the levels that
 * model offers, each named for what it buys. Tiers pick their own effort, so
 * this only renders when the selection is not a tier.
 */
export function ReasoningEffortPicker({
  modelId,
  effort,
  onChange,
}: {
  modelId: string;
  effort: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}) {
  const model = getModelById(modelId);
  const options = REASONING_EFFORTS.filter((step) =>
    model.availableEfforts.includes(step)
  ).map((step) => ({
    id: step,
    label: REASONING_EFFORT_LABELS[step].label,
    description: REASONING_EFFORT_LABELS[step].description,
  }));
  return (
    <ValueMenu
      value={effort}
      options={options}
      onSelect={onChange}
      ariaLabel="Reasoning effort"
      disabled={options.length <= 1}
      tooltip={
        options.length <= 1
          ? `${model.displayName} has a single reasoning effort`
          : undefined
      }
    />
  );
}

export function ModelPicker({
  selection,
  onChange,
}: {
  selection: ModelSelection;
  onChange: (selection: ModelSelection) => void;
}) {
  const [showMoreModels, setShowMoreModels] = useState(false);
  const selectedModel = getModelById(selection.modelId);
  const selectedTier = MODEL_TIERS.find((tier) => tier.id === selection.tierId);
  const label = selectedTier ? selectedTier.label : selectedModel.displayName;
  // A tier is a policy, not a vendor, so only a specific model shows its logo.
  const triggerIcon = selectedTier ? undefined : selectedModel.logo;

  const pickTier = (tierId: ModelTierId) => {
    const tier = MODEL_TIERS.find((candidate) => candidate.id === tierId)!;
    onChange({
      tierId,
      modelId: tier.modelId,
      effort: getModelById(tier.modelId).defaultEffort,
    });
  };

  const pickModel = (modelId: string) => {
    onChange({
      tierId: null,
      modelId,
      effort: getModelById(modelId).defaultEffort,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost-secondary"
          isSelect
          icon={triggerIcon}
          label={label}
          tooltip={
            selectedModel.isDegraded
              ? `${selectedModel.displayName} is unstable right now. You may want to select another model.`
              : undefined
          }
          aria-label={`Model picker: ${label}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="w-84 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
      >
        <div className="flex items-center justify-between pr-2">
          <DropdownMenuLabel label="Model tier" />
          <Popover
            trigger={
              <Button
                size="xs"
                variant="ghost"
                icon={InfoCircle}
                aria-label="About model tiers"
              />
            }
            content={
              <div className="flex max-w-xs flex-col gap-2 text-sm text-foreground">
                <span>
                  Dust selects a model and automatically switches to another if
                  the selected model is unstable.
                </span>
                <Hoverable
                  variant="highlight"
                  href="https://docs.dust.tt"
                  target="_blank"
                >
                  Learn more
                </Hoverable>
              </div>
            }
          />
        </div>
        {MODEL_TIERS.map((tier) => {
          const resolved = getModelById(tier.modelId);
          const isSelected = selection.tierId === tier.id;
          const isDefault = tier.id === DEFAULT_TIER_ID;
          return (
            <DropdownMenuItem
              key={tier.id}
              label={isDefault ? `${tier.label} (Default)` : tier.label}
              icon={tier.locked ? Lock01 : undefined}
              tooltip={
                tier.locked ? TIER_LOCK_TOOLTIPS[tier.locked] : undefined
              }
              disabled={Boolean(tier.locked)}
              onSelect={(event) => {
                event.preventDefault();
                pickTier(tier.id);
              }}
              endComponent={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {resolved.displayName}
                  </span>
                  {isSelected ? <Icon visual={Check} size="xs" /> : null}
                </div>
              }
            />
          );
        })}
        {selection.tierId !== DEFAULT_TIER_ID ? (
          <DropdownMenuItem
            label="Reset to default"
            icon={RefreshCw02}
            onSelect={(event) => {
              event.preventDefault();
              pickTier(DEFAULT_TIER_ID);
            }}
          />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          label="More models"
          icon={showMoreModels ? ChevronDown : ChevronRight}
          onSelect={(event) => {
            event.preventDefault();
            setShowMoreModels((open) => !open);
          }}
        />
        {showMoreModels
          ? MAKERS.map((maker) => (
              <div key={maker}>
                <DropdownMenuLabel label={maker} />
                {mockModels
                  .filter((model) => model.maker === maker)
                  .map((model) => {
                    const isSelected =
                      selection.tierId === null &&
                      selection.modelId === model.id;
                    const isDefault =
                      model.id ===
                      MODEL_TIERS.find((tier) => tier.id === DEFAULT_TIER_ID)!
                        .modelId;
                    return (
                      <DropdownMenuItem
                        key={model.id}
                        icon={model.logo}
                        label={
                          isDefault
                            ? `${model.displayName} (Default)`
                            : model.displayName
                        }
                        tooltip={
                          model.isDegraded
                            ? `${model.displayName} is unstable right now. You may want to select another model.`
                            : undefined
                        }
                        onSelect={(event) => {
                          event.preventDefault();
                          pickModel(model.id);
                        }}
                        endComponent={
                          isSelected ? (
                            <Chip
                              size="mini"
                              color="highlight"
                              label="Selected"
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
              </div>
            ))
          : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
