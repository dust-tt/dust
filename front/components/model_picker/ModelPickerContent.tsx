import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import { ModelPickerModelsView } from "@app/components/model_picker/ModelPickerModelsView";
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
  ModelConfigurationType,
  ModelMakerIdType,
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

interface ModelPickerContentProps {
  side: "top" | "bottom";
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers,
  // so the menu stays reachable after a pick.
  shouldBlockDismiss: () => boolean;
  shown: Selection;
  agentDefault: Selection;
  canRevert: boolean;
  lockPremiumEfforts: boolean;
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  search: string;
  onSearchChange: (value: string) => void;
  isMakersExpanded: boolean;
  onToggleMakers: () => void;
  activeMaker: ModelMakerIdType | null;
  onSelectMaker: (makerId: ModelMakerIdType) => void;
  onBack: () => void;
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
  streamModels,
  streams,
  search,
  onSearchChange,
  isMakersExpanded,
  onToggleMakers,
  activeMaker,
  onSelectMaker,
  onBack,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerContentProps) {
  const activeMakerGroup = makerGroups.find(
    (maker) => maker.makerId === activeMaker
  );
  const isShowingModels = activeMakerGroup !== undefined;

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
        <div className="max-h-[26rem] overflow-y-auto animate-in fade-in duration-200 motion-reduce:animate-none">
          <div
            key={isShowingModels ? "models" : "makers"}
            className={`animate-in duration-200 motion-reduce:animate-none ${isShowingModels ? "slide-in-from-right-4" : "slide-in-from-left-4"}`}
          >
            {activeMakerGroup ? (
              <ModelPickerModelsView
                makerId={activeMakerGroup.makerId}
                models={activeMakerGroup.models}
                shown={shown}
                agentDefault={agentDefault}
                canRevert={canRevert}
                lockPremiumEfforts={lockPremiumEfforts}
                onBack={onBack}
                onSelectModel={onSelectModel}
                onChangeEffort={onChangeEffort}
                onRevert={onRevert}
              />
            ) : (
              <ModelPickerMakersView
                makerGroups={makerGroups}
                allModels={allModels}
                shown={shown}
                agentDefault={agentDefault}
                canRevert={canRevert}
                lockPremiumEfforts={lockPremiumEfforts}
                search={search}
                onSearchChange={onSearchChange}
                onSelectMaker={onSelectMaker}
                onSelectModel={onSelectModel}
                onChangeEffort={onChangeEffort}
                onRevert={onRevert}
              />
            )}
          </div>
        </div>
      )}
    </DropdownMenuContent>
  );
}
