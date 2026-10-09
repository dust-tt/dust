import { DegradedInfoIcon } from "@app/components/model_picker/DegradedModelIcon";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import { ModelPickerMakersView } from "@app/components/model_picker/ModelPickerMakersView";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import type {
  MakerGroup,
  ModelPickerSelectionModel,
  ModelTierDefinition,
  ModelTierId,
} from "@app/components/model_picker/modelPickerUtils";
import {
  AUTO_MODELS_DOC_URL,
  formatModelEffortLabel,
  getModelLockTooltip,
  getTierFallbackMessage,
  getTierLockReason,
  getTierResolvedModelLabel,
  isTierResolvedModelHostedInRegion,
  isTierSelected,
} from "@app/components/model_picker/modelPickerUtils";
import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { RegionType } from "@app/types/region";
import {
  Button,
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  InfoCircle,
  LinkWrapper,
  Lock01,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  selection: ModelPickerSelectionModel;
  lockPremiumEfforts: boolean;
  ignoreTierRestrictions: boolean;
  tiers: ModelTierDefinition[];
  degradedModelIds: ReadonlySet<string>;
  fallbackStreamIds: ReadonlySet<string>;
  hostingRegion: RegionType | null;
  makerGroups: MakerGroup[];
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
  recommendationHint?: string | null;
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
  fallbackStreamIds,
  hostingRegion,
  makerGroups,
  streamModels,
  streams,
  recommendationHint: hint,
  isMakersExpanded,
  onToggleMakers,
  expandedMakerId,
  onToggleMaker,
  onSelectTier,
  onSelectModel,
  onChangeEffort,
  confirm,
}: ModelPickerContentProps) {
  const { t } = useLingui();

  return (
    <DropdownMenuContent
      className="w-84 max-w-(--radix-dropdown-menu-content-available-width)"
      align="end"
      side={side}
    >
      {tiers.length > 0 && (
        <DropdownMenuLabel className="flex items-center gap-1 text-sm">
          <Trans>Model tier</Trans>
          {hint && (
            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={InfoCircle}
                  className="-my-1 text-muted-foreground"
                  aria-label={t`About model tiers`}
                  onClick={(e) => e.stopPropagation()}
                />
              </PopoverTrigger>
              {/* Not portalled: the menu is modal, so content rendered outside
                  it is inert and a click in it dismisses the menu. */}
              <PopoverContent
                side="right"
                align="start"
                className="w-64 p-3"
                mountPortal={false}
              >
                <div className="text-xs text-muted-foreground">
                  {hint}{" "}
                  <LinkWrapper
                    href={AUTO_MODELS_DOC_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline"
                  >
                    <Trans>Learn more</Trans>
                  </LinkWrapper>
                </div>
              </PopoverContent>
            </PopoverRoot>
          )}
        </DropdownMenuLabel>
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
              label={t(tier.name)}
              disabled
              tooltip={getModelLockTooltip(t, lockReason)}
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
        const regionalFlag =
          hostingRegion !== null &&
          isTierResolvedModelHostedInRegion(tier, streams, hostingRegion) ? (
            <RegionalFlag region={hostingRegion} />
          ) : null;
        const isFallback = fallbackStreamIds.has(tier.metaModelId);
        const fallbackResolution = streams?.[tier.metaModelId];
        const fallbackTooltip =
          isFallback && fallbackResolution
            ? getTierFallbackMessage(
                t,
                t(tier.name),
                formatModelEffortLabel(
                  t,
                  fallbackResolution.displayName,
                  fallbackResolution.reasoningEffort
                )
              )
            : undefined;
        return (
          <DropdownMenuItem
            key={tier.id}
            icon={MODEL_TIER_ICON[tier.id]}
            label={t(tier.name)}
            className="text-foreground"
            tooltip={fallbackTooltip}
            endComponent={
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  {getTierResolvedModelLabel(t, tier.id, streams)}
                  {regionalFlag}
                </span>
                {isFallback && <DegradedInfoIcon />}
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
        label={t`More models`}
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
          hostingRegion={hostingRegion}
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
