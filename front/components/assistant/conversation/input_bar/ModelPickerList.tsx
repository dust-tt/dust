import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getInitialReasoningEffort,
  getModelKey,
  getSelectableReasoningEfforts,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerListProps {
  listState: ModelPickerListState;
  selected: ModelWithReasoningEffort | null;
  onSelectModel: (modelWithEffort: ModelWithReasoningEffort) => void;
  // On mobile the "More models" providers expand inline; this tracks the single
  // provider currently expanded.
  expandedProvider: ModelProviderIdType | null;
  onToggleProvider: (providerId: ModelProviderIdType) => void;
}

export function ModelPickerList({
  listState,
  selected,
  onSelectModel,
  expandedProvider,
  onToggleProvider,
}: ModelPickerListProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();

  const selectedEffortFor = (
    model: ModelConfigurationType
  ): ReasoningEffort | null =>
    selected &&
    getModelKey(selected.model.providerId, selected.model.modelId) ===
      getModelKey(model.providerId, model.modelId)
      ? selected.effort
      : null;

  switch (listState.kind) {
    case "hidden":
      return null;

    case "loading":
      return (
        <div className="flex h-20 items-center justify-center">
          <Spinner size="sm" />
        </div>
      );

    case "empty":
      return (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
          No models found
        </div>
      );

    case "search":
      return (
        <>
          <DropdownMenuSeparator />
          {listState.models.map((model) => (
            <ModelPickerLineItem
              key={getModelKey(model.providerId, model.modelId)}
              model={model}
              efforts={getSelectableReasoningEfforts(model)}
              initialEffort={getInitialReasoningEffort(model)}
              selectedEffort={selectedEffortFor(model)}
              isMobile={isMobile}
              onSelect={onSelectModel}
            />
          ))}
        </>
      );

    case "browse":
      return (
        <>
          {listState.currentSelection && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Selected" />
              <ModelPickerLineItem
                model={listState.currentSelection.model}
                efforts={getSelectableReasoningEfforts(
                  listState.currentSelection.model
                )}
                initialEffort={listState.currentSelection.effort}
                selectedEffort={selectedEffortFor(
                  listState.currentSelection.model
                )}
                isMobile={isMobile}
                onSelect={onSelectModel}
              />
            </>
          )}
          {listState.agentDefault && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Default from agent" />
              <ModelPickerLineItem
                model={listState.agentDefault.model}
                efforts={getSelectableReasoningEfforts(
                  listState.agentDefault.model
                )}
                initialEffort={listState.agentDefault.effort}
                selectedEffort={selectedEffortFor(listState.agentDefault.model)}
                isMobile={isMobile}
                onSelect={onSelectModel}
              />
            </>
          )}
          {listState.suggested.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Suggested" />
              {listState.suggested.map((suggestedModel) => (
                <ModelPickerLineItem
                  key={getModelKey(
                    suggestedModel.model.providerId,
                    suggestedModel.model.modelId
                  )}
                  model={suggestedModel.model}
                  efforts={getSelectableReasoningEfforts(suggestedModel.model)}
                  initialEffort={suggestedModel.effort}
                  selectedEffort={selectedEffortFor(suggestedModel.model)}
                  isMobile={isMobile}
                  onSelect={onSelectModel}
                  recommendation={suggestedModel.recommendation}
                />
              ))}
            </>
          )}
          {listState.moreByProvider.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="More models" />
              {listState.moreByProvider.map((provider) =>
                isMobile ? (
                  // On mobile the provider expands inline below its name
                  // instead of opening a nested submenu (which is awkward to
                  // reach on touch).
                  <Fragment key={provider.providerId}>
                    <DropdownMenuItem
                      label={getProviderDisplayName(provider.providerId)}
                      icon={getModelProviderLogo(provider.providerId, isDark)}
                      endComponent={
                        <Icon
                          visual={
                            expandedProvider === provider.providerId
                              ? ChevronDown
                              : ChevronRight
                          }
                          size="xs"
                        />
                      }
                      onClick={() => onToggleProvider(provider.providerId)}
                      onSelect={(e) => e.preventDefault()}
                    />
                    {expandedProvider === provider.providerId && (
                      <ModelPickerProviderSection
                        provider={provider}
                        selected={selected}
                        isMobile={isMobile}
                        onSelect={onSelectModel}
                      />
                    )}
                  </Fragment>
                ) : (
                  <DropdownMenuSub key={provider.providerId}>
                    <DropdownMenuSubTrigger
                      label={getProviderDisplayName(provider.providerId)}
                      icon={getModelProviderLogo(provider.providerId, isDark)}
                    />
                    <DropdownMenuSubContent>
                      <ModelPickerProviderSection
                        provider={provider}
                        selected={selected}
                        isMobile={isMobile}
                        onSelect={onSelectModel}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              )}
            </>
          )}
        </>
      );

    default:
      assertNeverAndIgnore(listState);
      return null;
  }
}
