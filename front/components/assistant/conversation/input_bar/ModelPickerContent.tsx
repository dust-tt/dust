import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import { ModelPickerSubTrigger } from "@app/components/assistant/conversation/input_bar/ModelPickerSubTrigger";
import { MoreModelsPanel } from "@app/components/assistant/conversation/input_bar/MoreModelsPanel";
import type {
  ModelPickerListState,
  ModelTierId,
  ModelWithReasoningEffort,
  ResolvedTier,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { REASONING_EFFORT_INFO } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { RevertToDefaultIndicator } from "@app/components/assistant/conversation/input_bar/RevertToDefaultIndicator";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  listState: ModelPickerListState;
  selectedKey?: string;
  // The tier that matches the current selection (null when the selection lives
  // in the "More models" list).
  selectedTierId: ModelTierId | null;
  onSelectTier: (resolved: ResolvedTier) => void;
  onSelectModel: (modelWithEffort: ModelWithReasoningEffort) => void;
  // Whether the current selection differs from the default, i.e. there is
  // something to revert. The selected row's check turns into a clickable X on
  // hover when true.
  canRevert: boolean;
  onRevert: () => void;
  // The tier / model line that carries the "(Default)" marker (whichever the
  // selection would revert to).
  defaultTierId: ModelTierId | null;
  defaultModelKey?: string;
  // "More models" panel:
  search: string;
  onSearchChange: (value: string) => void;
  filteredModels: ModelWithReasoningEffort[];
  // True when the current selection is a concrete model reached through "More
  // models" (rather than a tier): the "More models" row shows a check.
  moreModelsSelected: boolean;
  selectedMakerId: ModelMakerIdType | null;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  // On width-constrained clients (mobile, extension) the "More models" section
  // expands inline rather than opening a nested submenu.
  isMoreModelsExpanded: boolean;
  onToggleMoreModels: () => void;
}

export function ModelPickerContent({
  side,
  listState,
  selectedKey,
  selectedTierId,
  onSelectTier,
  onSelectModel,
  canRevert,
  onRevert,
  defaultTierId,
  defaultModelKey,
  search,
  onSearchChange,
  filteredModels,
  moreModelsSelected,
  selectedMakerId,
  expandedMaker,
  onToggleMaker,
  isMoreModelsExpanded,
  onToggleMoreModels,
}: ModelPickerContentProps) {
  const isMobile = useIsMobile();
  const clientType = useClientType();
  const expandProvidersInline = isMobile || clientType === "extension";

  const morePanel = (
    <MoreModelsPanel
      search={search}
      onSearchChange={onSearchChange}
      filteredModels={filteredModels}
      moreByMaker={listState.kind === "ready" ? listState.moreByMaker : []}
      selectedKey={selectedKey}
      defaultModelKey={defaultModelKey}
      canRevert={canRevert}
      onRevert={onRevert}
      selectedMakerId={selectedMakerId}
      onSelectModel={onSelectModel}
      isMobile={isMobile}
      expandProvidersInline={expandProvidersInline}
      expandedMaker={expandedMaker}
      onToggleMaker={onToggleMaker}
    />
  );

  return (
    <DropdownMenuContent className="w-72" align="start" side={side}>
      {listState.kind === "loading" && (
        <div className="flex h-20 items-center justify-center">
          <Spinner size="sm" />
        </div>
      )}

      {listState.kind === "empty" && (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
          No models found
        </div>
      )}

      {listState.kind === "ready" && (
        <>
          {listState.tiers.map((resolved) => (
            <TierRow
              key={resolved.tier.id}
              resolved={resolved}
              isMobile={isMobile}
              selected={resolved.tier.id === selectedTierId}
              isDefault={resolved.tier.id === defaultTierId}
              canRevert={canRevert}
              onRevert={onRevert}
              onSelect={onSelectTier}
            />
          ))}

          {listState.moreByMaker.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {expandProvidersInline ? (
                <>
                  <DropdownMenuItem
                    className="group/model-row"
                    label="More models"
                    endComponent={
                      <span className="flex items-center gap-2">
                        {moreModelsSelected && (
                          <RevertToDefaultIndicator
                            canRevert={canRevert}
                            onRevert={onRevert}
                          />
                        )}
                        <Icon
                          visual={
                            isMoreModelsExpanded ? ChevronDown : ChevronRight
                          }
                          size="xs"
                        />
                      </span>
                    }
                    onClick={onToggleMoreModels}
                    onSelect={(e) => e.preventDefault()}
                  />
                  {isMoreModelsExpanded && morePanel}
                </>
              ) : (
                <DropdownMenuSub>
                  <ModelPickerSubTrigger
                    label="More models"
                    checked={moreModelsSelected}
                    canRevert={canRevert}
                    onRevert={onRevert}
                  />
                  <DropdownMenuSubContent className="w-72">
                    {morePanel}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </>
          )}
        </>
      )}
    </DropdownMenuContent>
  );
}

interface TierRowProps {
  resolved: ResolvedTier;
  isMobile: boolean;
  selected: boolean;
  isDefault: boolean;
  canRevert: boolean;
  onRevert: () => void;
  onSelect: (resolved: ResolvedTier) => void;
}

function TierRow({
  resolved,
  isMobile,
  selected,
  isDefault,
  canRevert,
  onRevert,
  onSelect,
}: TierRowProps) {
  const { tier, modelWithEffort } = resolved;
  return (
    <ModelPickerRowTooltip
      description={modelWithEffort ? "" : tier.tooltip}
      isMobile={isMobile}
      media={
        modelWithEffort ? (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <div className="font-medium text-foreground dark:text-foreground-night">
                {modelWithEffort.model.displayName}
              </div>
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                {modelWithEffort.model.shortDescription}
              </div>
            </div>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {REASONING_EFFORT_INFO[modelWithEffort.effort].reasoning}
            </div>
          </div>
        ) : undefined
      }
    >
      <DropdownMenuItem
        className="group/model-row"
        icon={tier.icon}
        label={tier.name}
        endComponent={
          <span className="flex items-center gap-2">
            <span className="text-xs font-normal text-muted-foreground dark:text-muted-foreground-night">
              {isDefault ? "(Default)" : tier.subtitle}
            </span>
            {selected && (
              <RevertToDefaultIndicator
                canRevert={canRevert}
                onRevert={onRevert}
              />
            )}
          </span>
        }
        onClick={() => onSelect(resolved)}
      />
    </ModelPickerRowTooltip>
  );
}
