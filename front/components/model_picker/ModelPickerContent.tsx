import { ModelPickerMoreModels } from "@app/components/model_picker/ModelPickerMoreModels";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type {
  MakerGroup,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getModelLockTooltip,
  getTierLockReason,
  getTierResolvedModelLabel,
  isTierDisplayed,
  MODEL_TIERS,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import type {
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
} from "@dust-tt/sparkle";

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
  allModels: EnabledModelConfigurationType[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  search: string;
  onSearchChange: (value: string) => void;
  moreModelsExpanded: boolean;
  onToggleMoreModels: () => void;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: EnabledModelConfigurationType) => void;
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
  streamModels,
  streams,
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
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="start"
      side={side}
    >
      <DropdownMenuLabel label="Recommendations" className="text-sm" />

      {MODEL_TIERS.map((tier) => {
        const isSelected = isTierDisplayed(tier.id, shown.display);
        const lockReason = getTierLockReason(tier.id, {
          lockPremiumEfforts,
          streamModels,
        });
        if (lockReason) {
          return (
            <DropdownMenuItem
              key={tier.id}
              icon={MODEL_TIER_ICON[tier.id]}
              label={tier.name}
              disabled
              tooltip={getModelLockTooltip(lockReason)}
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
            icon={MODEL_TIER_ICON[tier.id]}
            label={tier.name}
            className="text-foreground"
            endComponent={
              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {getTierResolvedModelLabel(tier.id, streams)}
                </span>
                {isSelected && (
                  <ModelPickerSelectionIndicator
                    canRevert={canRevert}
                    onRevert={onRevert}
                    size="xs"
                  />
                )}
              </div>
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
