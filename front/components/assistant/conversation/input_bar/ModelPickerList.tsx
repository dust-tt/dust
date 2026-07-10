import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelWithReasoningEffortKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
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
  selectedKey?: string;
  onSelectModel: (modelWithEffort: ModelWithReasoningEffort) => void;
  // On mobile the "More models" providers expand inline; this tracks the single
  // provider currently expanded.
  expandedProvider: ModelProviderIdType | null;
  onToggleProvider: (providerId: ModelProviderIdType) => void;
}

export function ModelPickerList({
  listState,
  selectedKey,
  onSelectModel,
  expandedProvider,
  onToggleProvider,
}: ModelPickerListProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();

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
          <DropdownMenuRadioGroup value={selectedKey}>
            {listState.models.map((modelWithEffort) => (
              <ModelPickerLineItem
                key={getModelWithReasoningEffortKey(
                  modelWithEffort.model.providerId,
                  modelWithEffort.model.modelId,
                  modelWithEffort.effort
                )}
                modelWithEffort={modelWithEffort}
                isMobile={isMobile}
                onSelect={onSelectModel}
              />
            ))}
          </DropdownMenuRadioGroup>
        </>
      );

    case "browse":
      return (
        <>
          {listState.agentDefault && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Default from agent" />
              <DropdownMenuRadioGroup value={selectedKey}>
                <ModelPickerLineItem
                  key={getModelWithReasoningEffortKey(
                    listState.agentDefault.model.providerId,
                    listState.agentDefault.model.modelId,
                    listState.agentDefault.effort
                  )}
                  modelWithEffort={listState.agentDefault}
                  isMobile={isMobile}
                  onSelect={onSelectModel}
                />
              </DropdownMenuRadioGroup>
            </>
          )}
          {listState.suggested.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Suggested" />
              <DropdownMenuRadioGroup value={selectedKey}>
                {listState.suggested.map((modelWithEffort) => (
                  <ModelPickerLineItem
                    key={getModelWithReasoningEffortKey(
                      modelWithEffort.model.providerId,
                      modelWithEffort.model.modelId,
                      modelWithEffort.effort
                    )}
                    modelWithEffort={modelWithEffort}
                    isMobile={isMobile}
                    onSelect={onSelectModel}
                    recommendation={modelWithEffort.recommendation}
                  />
                ))}
              </DropdownMenuRadioGroup>
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
                        selectedKey={selectedKey}
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
                        selectedKey={selectedKey}
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
