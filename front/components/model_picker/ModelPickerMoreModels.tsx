import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import type {
  MakerGroup,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getEffortStops,
  getInitialEffort,
  getModelKey,
  getModelLockReason,
  isModelSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  Check,
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerMoreModelsProps {
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  shown: Selection;
  agentDefault: Selection;
  // Whether the active selection differs from the agent default.
  canRevert: boolean;
  // When true, premium (model, effort) picks are locked (workspace not on a
  // credit-based plan).
  lockPremiumEfforts: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
  // Vetoes the interaction-outside dismissal that a model/effort pick triggers
  // on the open submenus, so they stay reachable after a pick.
  shouldBlockDismiss: () => boolean;
}

export function ModelPickerMoreModels({
  makerGroups,
  allModels,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  search,
  onSearchChange,
  isExpanded,
  onToggleExpanded,
  expandedMaker,
  onToggleMaker,
  onSelectModel,
  onChangeEffort,
  onRevert,
  shouldBlockDismiss,
}: ModelPickerMoreModelsProps) {
  const { isDark } = useTheme();

  // On width-constrained clients (mobile, extension) there are no submenus:
  // "More models" and each maker expand inline.
  const isWidthConstrained = useIsWidthConstrained();

  const query = search.trim().toLowerCase();
  const isSearching = query !== "";
  const searchResults = isSearching
    ? allModels.filter(
        (model) =>
          model.displayName.toLowerCase().includes(query) ||
          getModelMakerDisplayName(getModelMaker(model))
            .toLowerCase()
            .includes(query)
      )
    : [];

  const isSpecificModelSelected = shown.display.kind === "model";
  const selectedModelMaker =
    shown.display.kind === "model" ? getModelMaker(shown.display.model) : null;

  const renderModelRow = (
    model: ModelConfigurationType,
    showMakerIcon: boolean
  ) => {
    const isSelected = isModelSelection(model, shown.display);
    const isDefault = isModelSelection(model, agentDefault.display);
    const lockReason = getModelLockReason(model, { lockPremiumEfforts });
    const effort =
      isSelected && shown.display.kind === "model"
        ? shown.display.effort
        : getInitialEffort(model, { lockPremiumEfforts });
    return (
      <ModelPickerModelRow
        key={getModelKey(model.providerId, model.modelId)}
        model={model}
        isSelected={isSelected}
        isDefault={isDefault}
        lockReason={lockReason}
        effort={effort}
        effortStops={getEffortStops(model, { lockPremiumEfforts })}
        icon={
          showMakerIcon
            ? getModelMakerLogo(getModelMaker(model), isDark)
            : undefined
        }
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        canRevert={canRevert}
        onRevert={onRevert}
      />
    );
  };

  const searchbar = (
    <div className="sticky top-0 z-10 bg-overlay-background">
      <DropdownMenuSearchbar
        autoFocus={!isWidthConstrained}
        name="search-models"
        placeholder="Search for model"
        value={search}
        onChange={onSearchChange}
      />
    </div>
  );

  // The list body: flat search results, or the maker groups.
  const body = isSearching ? (
    searchResults.length > 0 ? (
      searchResults.map((model) => renderModelRow(model, true))
    ) : (
      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
        No models found
      </div>
    )
  ) : (
    makerGroups.map((maker) =>
      isWidthConstrained ? (
        <Fragment key={maker.makerId}>
          <DropdownMenuItem
            label={getModelMakerDisplayName(maker.makerId)}
            icon={getModelMakerLogo(maker.makerId, isDark)}
            endComponent={
              <div className="flex items-center gap-1">
                {selectedModelMaker === maker.makerId && (
                  <Icon
                    visual={Check}
                    size="sm"
                    className="text-muted-foreground"
                  />
                )}
                <Icon
                  visual={
                    expandedMaker === maker.makerId ? ChevronDown : ChevronRight
                  }
                  size="xs"
                />
              </div>
            }
            onClick={() => onToggleMaker(maker.makerId)}
            onSelect={(e) => e.preventDefault()}
          />
          {expandedMaker === maker.makerId &&
            maker.models.map((model) => renderModelRow(model, false))}
        </Fragment>
      ) : (
        <DropdownMenuSub key={maker.makerId}>
          {/* Children mode (not label/icon): DropdownMenuSubTrigger has no
              endComponent slot, so we compose the row ourselves to place the
              selection check to the right, before the built-in chevron. */}
          <DropdownMenuSubTrigger>
            <Icon visual={getModelMakerLogo(maker.makerId, isDark)} size="sm" />
            <span className="grow truncate text-left">
              {getModelMakerDisplayName(maker.makerId)}
            </span>
            {selectedModelMaker === maker.makerId && (
              <Icon
                visual={Check}
                size="sm"
                className="text-muted-foreground"
              />
            )}
            <Icon
              visual={ChevronRight}
              size="xs"
              className="text-muted-foreground"
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="max-h-96 w-64 overflow-y-auto"
            // Clicks inside a portaled submenu bubble up the React tree to the
            // parent menu, which would dismiss the whole picker (e.g. clicking
            // the searchbar or empty space). Contain them here.
            onClick={(e) => e.stopPropagation()}
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
            {maker.models.map((model) => renderModelRow(model, false))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    )
  );

  if (isWidthConstrained) {
    return (
      <>
        <DropdownMenuItem
          label="More models"
          endComponent={
            <div className="flex items-center gap-1">
              {isSpecificModelSelected && (
                <Icon
                  visual={Check}
                  size="sm"
                  className="text-muted-foreground"
                />
              )}
              <Icon
                visual={isExpanded ? ChevronDown : ChevronRight}
                size="xs"
              />
            </div>
          }
          onClick={onToggleExpanded}
          onSelect={(e) => e.preventDefault()}
        />
        {isExpanded && (
          <>
            {searchbar}
            {body}
          </>
        )}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      {/* Children mode: place the selection check to the right, before the
          built-in chevron (DropdownMenuSubTrigger has no endComponent slot). */}
      <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
        <span className="grow truncate text-left">More models</span>
        {isSpecificModelSelected && (
          <Icon visual={Check} size="sm" className="text-muted-foreground" />
        )}
        <Icon
          visual={ChevronRight}
          size="xs"
          className="text-muted-foreground"
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="max-h-112 w-64 overflow-y-auto"
        // Clicks inside a portaled submenu bubble up the React tree to the
        // parent menu, which would dismiss the whole picker (e.g. clicking the
        // searchbar or empty space). Contain them here.
        onClick={(e) => e.stopPropagation()}
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
        {searchbar}
        {body}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
