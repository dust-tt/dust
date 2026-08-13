import { ModelPickerMoreModels } from "@app/components/model_picker/ModelPickerMoreModels";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import type {
  MakerGroup,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  isTierDisplayed,
  isTierLocked,
  MODEL_TIERS,
  PREMIUM_MODEL_LOCKED_TOOLTIP,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  BarFull,
  BarHalf,
  BarLow,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// Tier trigger icons: rising bars from Fast to Complex.
const TIER_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

interface ModelPickerContentProps {
  side: "top" | "bottom";
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers
  // on the open submenus, so they stay reachable after a pick.
  shouldBlockDismiss: () => boolean;
  shown: Selection;
  agentDefault: Selection;
  canRevert: boolean;
  lockPremiumEfforts: boolean;
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  search: string;
  onSearchChange: (value: string) => void;
  moreModelsExpanded: boolean;
  onToggleMoreModels: () => void;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

export function ModelPickerContent({
  side,
  shouldBlockDismiss,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  makerGroups,
  allModels,
  search,
  onSearchChange,
  moreModelsExpanded,
  onToggleMoreModels,
  expandedMaker,
  onToggleMaker,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerContentProps) {
  return (
    <DropdownMenuContent className="w-72" align="start" side={side}>
      <DropdownMenuLabel label="Model" />

      {MODEL_TIERS.map((tier) => {
        const isSelected = isTierDisplayed(tier.id, shown.display);
        const isDefault = isTierDisplayed(tier.id, agentDefault.display);
        const locked = isTierLocked(tier.id, { lockPremiumEfforts });
        if (locked) {
          return (
            <DropdownMenuItem
              key={tier.id}
              icon={TIER_ICON[tier.id]}
              label={tier.name}
              disabled
              tooltip={PREMIUM_MODEL_LOCKED_TOOLTIP}
              endComponent={
                <Icon
                  visual={Lock01}
                  size="sm"
                  className="text-muted-foreground"
                />
              }
              onSelect={(e) => e.preventDefault()}
            />
          );
        }
        return (
          <DropdownMenuItem
            key={tier.id}
            icon={TIER_ICON[tier.id]}
            label={`${tier.name}${isDefault ? " (Default)" : ""}`}
            endComponent={
              isSelected ? (
                <ModelPickerSelectionIndicator
                  canRevert={canRevert}
                  onRevert={onRevert}
                />
              ) : (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {tier.description}
                </span>
              )
            }
            onClick={() => onSelectTier(tier.id)}
            onSelect={(e) => e.preventDefault()}
          />
        );
      })}

      <DropdownMenuSeparator />

      <ModelPickerMoreModels
        shouldBlockDismiss={shouldBlockDismiss}
        makerGroups={makerGroups}
        allModels={allModels}
        shown={shown}
        agentDefault={agentDefault}
        canRevert={canRevert}
        lockPremiumEfforts={lockPremiumEfforts}
        search={search}
        onSearchChange={onSearchChange}
        isExpanded={moreModelsExpanded}
        onToggleExpanded={onToggleMoreModels}
        expandedMaker={expandedMaker}
        onToggleMaker={onToggleMaker}
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        onRevert={onRevert}
      />
    </DropdownMenuContent>
  );
}
