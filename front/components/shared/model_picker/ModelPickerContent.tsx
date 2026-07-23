import { ModelPickerMoreModels } from "@app/components/shared/model_picker/ModelPickerMoreModels";
import { ModelPickerSelectionIndicator } from "@app/components/shared/model_picker/ModelPickerSelectionIndicator";
import type {
  MakerGroup,
  ModelTierId,
  Selection,
} from "@app/components/shared/model_picker/modelPickerUtils";
import {
  isTierDisplayed,
  MODEL_TIER_ICONS,
  MODEL_TIERS,
} from "@app/components/shared/model_picker/modelPickerUtils";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@dust-tt/sparkle";

interface ModelPickerItemsProps {
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers
  // on the open submenus, so they stay reachable after a pick.
  shouldBlockDismiss: () => boolean;
  shown: Selection;
  // The agent's own default, when there is one to compare against (input bar).
  // Absent in the agent builder, which edits the default itself: no "(Default)"
  // suffix is shown then.
  agentDefault?: Selection;
  // Whether the active selection differs from the agent default and can be
  // reverted. Always false in the agent builder (no default to revert to).
  canRevert?: boolean;
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  search: string;
  onSearchChange: (value: string) => void;
  isWidthConstrained: boolean;
  moreModelsExpanded: boolean;
  onToggleMoreModels: () => void;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectTier: (tierId: ModelTierId) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert?: () => void;
}

const noop = () => {};

// The picker body — tier rows + "More models" — without the surrounding
// DropdownMenuContent, so it can be embedded in another menu (agent builder).
export function ModelPickerItems({
  shouldBlockDismiss,
  shown,
  agentDefault,
  canRevert = false,
  makerGroups,
  allModels,
  search,
  onSearchChange,
  isWidthConstrained,
  moreModelsExpanded,
  onToggleMoreModels,
  expandedMaker,
  onToggleMaker,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerItemsProps) {
  return (
    <>
      {MODEL_TIERS.map((tier) => {
        const isSelected = isTierDisplayed(tier.id, shown.display);
        const isDefault = agentDefault
          ? isTierDisplayed(tier.id, agentDefault.display)
          : false;
        return (
          <DropdownMenuItem
            key={tier.id}
            icon={MODEL_TIER_ICONS[tier.id]}
            label={`${tier.name}${isDefault ? " (Default)" : ""}`}
            endComponent={
              isSelected ? (
                <ModelPickerSelectionIndicator
                  canRevert={canRevert}
                  onRevert={onRevert ?? noop}
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
        search={search}
        onSearchChange={onSearchChange}
        isWidthConstrained={isWidthConstrained}
        isExpanded={moreModelsExpanded}
        onToggleExpanded={onToggleMoreModels}
        expandedMaker={expandedMaker}
        onToggleMaker={onToggleMaker}
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        onRevert={onRevert}
      />
    </>
  );
}

interface ModelPickerContentProps extends ModelPickerItemsProps {
  side: "top" | "bottom";
}

export function ModelPickerContent({
  side,
  ...items
}: ModelPickerContentProps) {
  return (
    <DropdownMenuContent className="w-72" align="start" side={side}>
      <ModelPickerItems {...items} />
    </DropdownMenuContent>
  );
}
