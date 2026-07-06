import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useModels } from "@app/lib/swr/models";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { GPT_5_5_MODEL_ID } from "@app/types/assistant/models/openai";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  Icon,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useMemo, useRef, useState } from "react";

const SUGGESTED_PINS: {
  providerId: ModelProviderIdType;
  modelId: string;
  effort: ReasoningEffort;
  recommendation: string;
}[] = [
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "light",
    recommendation:
      "Quick answers. Recommended for easy retrieval, light analysis or general questions.",
  },
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "medium",
    recommendation:
      "Everyday tasks. Recommended for multi-step tasks, Frames, analysis.",
  },
  {
    providerId: "openai",
    modelId: GPT_5_5_MODEL_ID,
    effort: "high",
    recommendation:
      "Hard problems. Recommended for high quality retrieval, complex analysis and Frames",
  },
];

const AUTO_TOOLTIP =
  "Dust selects and switches model for cost efficient performance and reliability. When an agent is created using a specific model, we use this model.";

// Per reasoning-effort blurbs shown in each model's hover tooltip: what the
// effort does, and what it is recommended for.
const REASONING_EFFORT_INFO: Record<ReasoningEffort, { reasoning: string }> = {
  none: {
    reasoning: "No additional reasoning, for the fastest responses",
  },
  light: {
    reasoning: "Light reasoning effort, faster responses.",
  },
  medium: {
    reasoning: "Medium reasoning effort, balancing speed and quality.",
  },
  high: {
    reasoning: "High reasoning effort, longer wait times but higher quality.",
  },
};

interface ModelLine {
  model: ModelConfigurationType;
  effort: ReasoningEffort;
}

interface SuggestedLine extends ModelLine {
  recommendation: string;
}

interface ProviderGroup {
  providerId: ModelProviderIdType;
  models: { model: ModelConfigurationType; efforts: ReasoningEffort[] }[];
}

type Selection =
  | { kind: "auto" }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

function getSelectableReasoningEfforts(
  model: ModelConfigurationType
): ReasoningEffort[] {
  const efforts = getAvailableReasoningEfforts(model.supportedReasoningEfforts);
  const withReasoning = efforts.filter((effort) => effort !== "none");
  return withReasoning.length > 0 ? withReasoning : efforts;
}

function getLineKey(
  providerId: string,
  modelId: string,
  effort: ReasoningEffort
): string {
  return `${providerId}/${modelId}/${effort}`;
}

function getLineLabel(selection: Selection): string {
  if (selection.kind === "auto") {
    return "Auto";
  }
  const { model, effort } = selection;

  if (effort === "none") {
    return model.displayName;
  }

  return `${model.displayName} ${capitalize(effort)}`;
}

// Converts the picker's local selection into the API model selection
function toModelSelection(
  selection: Selection
): ModelSelectionType | undefined {
  switch (selection.kind) {
    case "auto":
      return undefined;
    case "model":
      return {
        providerId: selection.model.providerId,
        modelId: selection.model.modelId,
        reasoningEffort: selection.effort,
      };
    default:
      assertNeverAndIgnore(selection);
      return undefined;
  }
}
// TODO: test for EU
interface InputBarModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
  owner: LightWorkspaceType;
  buttonSize: "xs" | "sm";
  // Which side the dropdown opens toward. Mirrors the agent picker: "top" in an
  // active conversation (input bar pinned to the bottom), "bottom" on the new
  // conversation screen where there is room below.
  side?: "top" | "bottom";
  disabled?: boolean;
  onSelectionChange?: (modelSelection: ModelSelectionType | undefined) => void;
}

export function InputBarModelPicker({
  agentModel,
  owner,
  buttonSize,
  side = "top",
  disabled,
  onSelectionChange,
}: InputBarModelPickerProps) {
  const { hasFeature } = useFeatureFlags();
  const hasModelsPicker = hasFeature("models_picker");
  const { isDark } = useTheme();
  const isMobile = useIsMobile();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // The list of models is hidden while "Auto" is on.
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "auto" });

  // On mobile there are no nested submenus: the "More models" providers expand
  // inline below their name. This tracks the single provider currently expanded.
  const [expandedProvider, setExpandedProvider] =
    useState<ModelProviderIdType | null>(null);

  // Commit a selection and notify the parent so it can attach (or, for "auto",
  // clear) the per-message model override on the next send. Called from the
  // user-driven handlers below and from the agent-change reset. `onSelectionChange`
  // only stashes the value in a parent ref, so calling it here — including during
  // the render-time reset — triggers no parent re-render.
  const commitSelection = (next: Selection) => {
    setSelection(next);
    onSelectionChange?.(toModelSelection(next));
  };

  // Reset to Auto when the agent changes: a per-message override should not leak
  // across agents.
  const agentModelKey = agentModel
    ? `${agentModel.providerId}/${agentModel.modelId}`
    : null;
  const prevAgentModelKeyRef = useRef(agentModelKey);
  if (agentModelKey !== prevAgentModelKeyRef.current) {
    prevAgentModelKeyRef.current = agentModelKey;
    commitSelection({ kind: "auto" });
    setExpanded(false);
  }

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

  const allLines = useMemo<ModelLine[]>(
    () =>
      models.flatMap((model) =>
        getSelectableReasoningEfforts(model).map((effort) => ({
          model,
          effort,
        }))
      ),
    [models]
  );

  // Resolve the pinned combos against the workspace's actual models (skipping any
  // the workspace doesn't have or that don't support the pinned effort).
  const suggestedLines = useMemo<SuggestedLine[]>(
    () =>
      SUGGESTED_PINS.flatMap((pin) => {
        const model = models.find(
          (m) => m.providerId === pin.providerId && m.modelId === pin.modelId
        );
        if (
          !model ||
          !getAvailableReasoningEfforts(
            model.supportedReasoningEfforts
          ).includes(pin.effort)
        ) {
          return [];
        }
        return [
          {
            model,
            effort: pin.effort,
            recommendation: pin.recommendation,
          },
        ];
      }),
    [models]
  );

  const moreByProvider = useMemo<ProviderGroup[]>(() => {
    const providers = new Map<
      ModelProviderIdType,
      Map<string, { model: ModelConfigurationType; efforts: ReasoningEffort[] }>
    >();
    for (const line of allLines) {
      const providerId = line.model.providerId;
      let modelsMap = providers.get(providerId);
      if (!modelsMap) {
        modelsMap = new Map();
        providers.set(providerId, modelsMap);
      }
      let entry = modelsMap.get(line.model.modelId);
      if (!entry) {
        entry = { model: line.model, efforts: [] };
        modelsMap.set(line.model.modelId, entry);
      }
      entry.efforts.push(line.effort);
    }
    return Array.from(providers.entries()).map(([providerId, modelsMap]) => ({
      providerId,
      models: Array.from(modelsMap.values()),
    }));
  }, [allLines]);

  const isSearching = search.trim() !== "";

  const filterLines = <T extends ModelLine>(lines: T[]): T[] => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return lines;
    }
    return lines.filter(
      (l) =>
        getLineLabel({ model: l.model, effort: l.effort, kind: "model" })
          .toLowerCase()
          .includes(q) ||
        getProviderDisplayName(l.model.providerId).toLowerCase().includes(q)
    );
  };

  // While searching we show a single flat list over every model/effort.
  const filteredAll = filterLines(allLines);

  const selectedKey =
    selection.kind === "model"
      ? getLineKey(
          selection.model.providerId,
          selection.model.modelId,
          selection.effort
        )
      : undefined;

  // Auto is "on" while it is the committed selection and the list has not been
  // manually expanded for browsing. It is hidden entirely while searching.
  const isAutoOn = selection.kind === "auto" && !expanded;
  const showAuto = !isSearching;
  const showList = expanded || isSearching || selection.kind === "model";

  let label = isMobile ? "Model" : `Model: ${getLineLabel(selection)}`;

  let buttonIcon =
    isMobile && selection.kind === "model"
      ? getModelProviderLogo(selection.model.providerId, isDark)
      : undefined;

  const toggleAuto = () => {
    if (isAutoOn) {
      setExpanded(true);
    } else {
      commitSelection({ kind: "auto" });
      setExpanded(false);
    }
  };

  if (!hasModelsPicker) {
    return null;
  }

  // Wraps a dropdown row in its hover tooltip on desktop. On mobile there is no
  // hover, so we skip the tooltip entirely and render the row as-is. The `key` is
  // applied to whichever element ends up outermost so it is valid inside `.map`.
  const withTooltip = (
    key: string,
    description: string,
    media: ReactNode,
    child: ReactElement
  ): ReactElement => {
    if (isMobile) {
      return <Fragment key={key}>{child}</Fragment>;
    }
    return (
      <DropdownTooltipTrigger key={key} description={description} media={media}>
        {child}
      </DropdownTooltipTrigger>
    );
  };

  const renderModelLine = (line: ModelLine, recommendation?: string) => {
    const key = getLineKey(
      line.model.providerId,
      line.model.modelId,
      line.effort
    );
    const info = REASONING_EFFORT_INFO[line.effort];
    return withTooltip(
      key,
      recommendation ?? "",
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="font-medium text-foreground dark:text-foreground-night">
            {line.model.displayName}
          </div>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            {line.model.shortDescription}
          </div>
        </div>
        <div className="text-muted-foreground dark:text-muted-foreground-night">
          {info.reasoning}
        </div>
      </div>,
      <DropdownMenuRadioItem
        value={key}
        onClick={() =>
          commitSelection({
            kind: "model",
            model: line.model,
            effort: line.effort,
          })
        }
      >
        <span className="flex grow items-center gap-2">
          <span className="line-clamp-1">{line.model.displayName}</span>
          {line.effort !== "none" && (
            <Chip size="mini" label={capitalize(line.effort)} />
          )}
        </span>
      </DropdownMenuRadioItem>
    );
  };

  // The per-model sections (one label + its effort lines) shown for a provider.
  // Rendered inside a submenu on desktop and inline under the provider name on
  // mobile.
  const renderProviderModels = (provider: ProviderGroup) =>
    provider.models.map((entry, index) => (
      <Fragment key={entry.model.modelId}>
        {index > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel label={entry.model.displayName} />
        <DropdownMenuRadioGroup value={selectedKey}>
          {entry.efforts.map((effort) =>
            renderModelLine({ model: entry.model, effort })
          )}
        </DropdownMenuRadioGroup>
      </Fragment>
    ));

  const hasResults = isSearching
    ? filteredAll.length > 0
    : suggestedLines.length > 0 || moreByProvider.length > 0;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearch("");
          setExpanded(false);
          setExpandedProvider(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          size={buttonSize}
          label={label}
          icon={buttonIcon}
          disabled={disabled}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start" side={side}>
        <div className="sticky top-0 z-10 bg-overlay-background pb-1">
          <DropdownMenuSearchbar
            autoFocus={!isMobile}
            name="search-models"
            placeholder="Search models"
            value={search}
            onChange={setSearch}
          />
        </div>

        {showAuto &&
          withTooltip(
            "auto",
            AUTO_TOOLTIP,
            undefined,
            <DropdownMenuItem
              label="Auto"
              endComponent={<SliderToggle size="xs" selected={isAutoOn} />}
              onClick={toggleAuto}
              onSelect={(e) => e.preventDefault()}
            />
          )}

        {showList &&
          (isModelsLoading ? (
            <div className="flex h-20 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : !hasResults ? (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
              No models found
            </div>
          ) : isSearching ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedKey}>
                {filteredAll.map((line) => renderModelLine(line))}
              </DropdownMenuRadioGroup>
            </>
          ) : (
            <>
              {suggestedLines.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="Suggested" />
                  <DropdownMenuRadioGroup value={selectedKey}>
                    {suggestedLines.map((line) =>
                      renderModelLine(line, line.recommendation)
                    )}
                  </DropdownMenuRadioGroup>
                </>
              )}
              {moreByProvider.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel label="More models" />
                  {moreByProvider.map((provider) =>
                    isMobile ? (
                      // On mobile the provider expands inline below its name
                      // instead of opening a nested submenu (which is awkward to
                      // reach on touch).
                      <Fragment key={provider.providerId}>
                        <DropdownMenuItem
                          label={getProviderDisplayName(provider.providerId)}
                          icon={getModelProviderLogo(
                            provider.providerId,
                            isDark
                          )}
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
                          onClick={() =>
                            setExpandedProvider((current) =>
                              current === provider.providerId
                                ? null
                                : provider.providerId
                            )
                          }
                          onSelect={(e) => e.preventDefault()}
                        />
                        {expandedProvider === provider.providerId &&
                          renderProviderModels(provider)}
                      </Fragment>
                    ) : (
                      <DropdownMenuSub key={provider.providerId}>
                        <DropdownMenuSubTrigger
                          label={getProviderDisplayName(provider.providerId)}
                          icon={getModelProviderLogo(
                            provider.providerId,
                            isDark
                          )}
                        />
                        <DropdownMenuSubContent>
                          {renderProviderModels(provider)}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )
                  )}
                </>
              )}
            </>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
