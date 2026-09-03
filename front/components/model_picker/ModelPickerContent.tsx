import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type {
  MakerGroup,
  ModelPickerSelectionModel,
  ModelTierDefinition,
  ModelTierId,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getModelLockTooltip,
  getTierLockReason,
  getTierResolvedModelLabel,
  isTierSelected,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  Button,
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
} from "@dust-tt/sparkle";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  selection: ModelPickerSelectionModel;
  lockPremiumEfforts: boolean;
  ignoreTierRestrictions: boolean;
  tiers: ModelTierDefinition[];
  degradedModelIds: ReadonlySet<string>;
  makerGroups: MakerGroup[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  isMakersExpanded: boolean;
  onToggleMakers: () => void;
  expandedMakerId: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort?: (
    model: ModelConfigurationType,
    effort: ReasoningEffort
  ) => void;
  // The action closing a menu that only stages a selection (the bulk "Set
  // model" dropdown); menus that apply their picks immediately pass none.
  confirm?: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
  };
}

export function ModelPickerContent({
  side,
  selection,
  lockPremiumEfforts,
  ignoreTierRestrictions,
  tiers,
  degradedModelIds,
  makerGroups,
  streamModels,
  streams,
  isMakersExpanded,
  onToggleMakers,
  expandedMakerId,
  onToggleMaker,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  confirm,
}: ModelPickerContentProps) {
  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="end"
      side={side}
    >
      {tiers.length > 0 && (
        <DropdownMenuLabel label="Recommendations" className="text-sm" />
      )}

      {tiers.map((tier) => {
        const isSelected = isTierSelected(tier.id, selection);
        const lockReason = ignoreTierRestrictions
          ? null
          : getTierLockReason(tier.id, { lockPremiumEfforts, streamModels });
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
                    onRevert={selection.onRevert}
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

      {tiers.length > 0 && <DropdownMenuSeparator />}

      <DropdownMenuItem
        label="More models"
        endComponent={
          <Icon
            visual={isMakersExpanded ? ChevronDown : ChevronRight}
            size="xs"
            className="text-muted-foreground"
          />
        }
        onClick={onToggleMakers}
        onSelect={(e) => e.preventDefault()}
      />

      {isMakersExpanded && (
        <ModelPickerMakersView
          makerGroups={makerGroups}
          selection={selection}
          ignoreTierRestrictions={ignoreTierRestrictions}
          lockPremiumEfforts={lockPremiumEfforts}
          degradedModelIds={degradedModelIds}
          expandedMakerId={expandedMakerId}
          onToggleMaker={onToggleMaker}
          onSelectModel={onSelectModel}
          onChangeEffort={onChangeEffort}
        />
      )}

      {confirm && (
        <>
          <DropdownMenuSeparator />
          <div className="p-1">
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              label={confirm.label}
              disabled={confirm.disabled}
              onClick={confirm.onClick}
            />
          </div>
        </>
      )}
    </DropdownMenuContent>
  );
}
