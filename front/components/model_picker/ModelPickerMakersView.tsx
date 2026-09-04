import { DegradedModelIcon } from "@app/components/model_picker/DegradedModelIcon";
import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import type {
  MakerGroup,
  ModelPickerSelectionModel,
} from "@app/components/model_picker/modelPickerUtils";
import {
  findSelectedModelEntry,
  getEffortStops,
  getInitialEffort,
  getModelKey,
  getModelLockReason,
  isModelSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useCanHover, useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerMakersViewProps {
  makerGroups: MakerGroup[];
  selection: ModelPickerSelectionModel;
  ignoreTierRestrictions: boolean;
  // When true, premium (model, effort) picks are locked (workspace not on a
  // credit-based plan).
  lockPremiumEfforts: boolean;
  degradedModelIds: ReadonlySet<string>;
  // Which maker is expanded inline. Only read on width-constrained clients,
  // where makers can't be submenus.
  expandedMakerId: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort?: (
    model: ModelConfigurationType,
    effort: ReasoningEffort
  ) => void;
}

export function ModelPickerMakersView({
  makerGroups,
  selection,
  ignoreTierRestrictions,
  lockPremiumEfforts,
  degradedModelIds,
  expandedMakerId,
  onToggleMaker,
  onSelectModel,
  onChangeEffort,
}: ModelPickerMakersViewProps) {
  const { isDark } = useTheme();

  // Submenus open on pointer enter, so touch input can never reach them, and on
  // a narrow viewport they would open off-screen (focusing them then scrolls the
  // page sideways). Either way, makers expand inline instead.
  const isWidthConstrained = useIsWidthConstrained();
  const canHover = useCanHover();
  const useInlineMakers = isWidthConstrained || !canHover;

  const makerIcon = (maker: MakerGroup) => {
    const makerLogo = getModelMakerLogo(maker.makerId, isDark);
    const hasDegradedModel = maker.models.some((model) =>
      degradedModelIds.has(model.modelId)
    );
    return hasDegradedModel ? (
      <DegradedModelIcon icon={makerLogo} surface="menu" />
    ) : (
      makerLogo
    );
  };

  const renderModelRows = (maker: MakerGroup) =>
    maker.models.map((model) => {
      const selectedEntry = findSelectedModelEntry(model, selection);
      const isSelected = selectedEntry !== undefined;
      const isDefault =
        selection.agentDefault !== null &&
        isModelSelection(model, selection.agentDefault);
      const lockReason = ignoreTierRestrictions
        ? null
        : getModelLockReason(model, { lockPremiumEfforts });
      const effort = selectedEntry
        ? selectedEntry.effort
        : getInitialEffort(model, { lockPremiumEfforts });
      return (
        <ModelPickerModelRow
          key={getModelKey(model.providerId, model.modelId)}
          model={model}
          isSelected={isSelected}
          isDefault={isDefault}
          lockReason={lockReason}
          isDegraded={degradedModelIds.has(model.modelId)}
          effort={effort}
          effortStops={getEffortStops(model, { lockPremiumEfforts })}
          onSelectModel={onSelectModel}
          onChangeEffort={
            onChangeEffort && ((next) => onChangeEffort(model, next))
          }
          onRevert={isSelected ? selection.onRevert : undefined}
        />
      );
    });

  if (useInlineMakers) {
    return (
      <>
        {makerGroups.map((maker) => (
          <Fragment key={maker.makerId}>
            <DropdownMenuItem
              label={getModelMakerDisplayName(maker.makerId)}
              icon={makerIcon(maker)}
              endComponent={
                <Icon
                  visual={
                    expandedMakerId === maker.makerId
                      ? ChevronDown
                      : ChevronRight
                  }
                  size="xs"
                  className="text-muted-foreground"
                />
              }
              onClick={() => onToggleMaker(maker.makerId)}
              onSelect={(e) => e.preventDefault()}
            />
            {expandedMakerId === maker.makerId && renderModelRows(maker)}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {makerGroups.map((maker) => (
        <DropdownMenuSub key={maker.makerId}>
          <DropdownMenuSubTrigger
            label={getModelMakerDisplayName(maker.makerId)}
            icon={makerIcon(maker)}
          />
          <DropdownMenuSubContent className="w-64">
            {renderModelRows(maker)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}
