import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelWithReasoningEffortKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
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
  // On width-constrained clients (mobile, extension) the "More models" makers
  // expand inline; this tracks the single maker currently expanded.
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
}

export function ModelPickerList({
  listState,
  selectedKey,
  onSelectModel,
  expandedMaker,
  onToggleMaker,
}: ModelPickerListProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const clientType = useClientType();

  const expandProvidersInline = isMobile || clientType === "extension";

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
          {listState.moreByMaker.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="More models" />
              {listState.moreByMaker.map((maker) =>
                expandProvidersInline ? (
                  // On width-constrained clients (mobile, extension) the maker
                  // expands inline below its name instead of opening a nested
                  // submenu.
                  <Fragment key={maker.makerId}>
                    <DropdownMenuItem
                      label={getModelMakerDisplayName(maker.makerId)}
                      icon={getModelMakerLogo(maker.makerId, isDark)}
                      endComponent={
                        <Icon
                          visual={
                            expandedMaker === maker.makerId
                              ? ChevronDown
                              : ChevronRight
                          }
                          size="xs"
                        />
                      }
                      onClick={() => onToggleMaker(maker.makerId)}
                      onSelect={(e) => e.preventDefault()}
                    />
                    {expandedMaker === maker.makerId && (
                      <ModelPickerProviderSection
                        maker={maker}
                        selectedKey={selectedKey}
                        isMobile={isMobile}
                        onSelect={onSelectModel}
                      />
                    )}
                  </Fragment>
                ) : (
                  <DropdownMenuSub key={maker.makerId}>
                    <DropdownMenuSubTrigger
                      label={getModelMakerDisplayName(maker.makerId)}
                      icon={getModelMakerLogo(maker.makerId, isDark)}
                    />
                    <DropdownMenuSubContent>
                      <ModelPickerProviderSection
                        maker={maker}
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
