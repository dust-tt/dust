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
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  Lock01,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers,
  // so the menu stays reachable after a pick.
  shouldBlockDismiss: () => boolean;
  selection: ModelPickerSelectionModel;
  lockPremiumEfforts: boolean;
  ignoreTierRestrictions: boolean;
  tiers: ModelTierDefinition[];
  makerGroups: MakerGroup[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  isMakersExpanded: boolean;
  onToggleMakers: () => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort?: (
    model: ModelConfigurationType,
    effort: ReasoningEffort
  ) => void;
  footer?: ReactNode;
}

export function ModelPickerContent({
  side,
  shouldBlockDismiss,
  selection,
  lockPremiumEfforts,
  ignoreTierRestrictions,
  tiers,
  makerGroups,
  streamModels,
  streams,
  isMakersExpanded,
  onToggleMakers,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  footer,
}: ModelPickerContentProps) {
  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="start"
      side={side}
      onFocusOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onPointerDownOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
      onInteractOutside={(e) => {
        if (shouldBlockDismiss()) {
          e.preventDefault();
        }
      }}
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
          onSelectModel={onSelectModel}
          onChangeEffort={onChangeEffort}
        />
      )}

      {footer}
    </DropdownMenuContent>
  );
}
