import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useModels } from "@app/lib/swr/models";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
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
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { Fragment, useEffect, useMemo, useState } from "react";

// Models pinned at the top of the list under "Suggested", in display order. Each
// pin is a concrete model + reasoning-effort pair (there can be several pins for
// the same model). A pin is only shown if the workspace actually has the model
// and it supports the given reasoning effort.
const SUGGESTED_PINS: {
  providerId: ModelProviderIdType;
  modelId: string;
  effort: ReasoningEffort;
  // Overrides the default per-effort recommendation for this pin. When omitted,
  // the effort's recommendation from REASONING_EFFORT_INFO is used.
  recommendation?: string;
}[] = [
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "light",
  },
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "medium",
  },
  {
    providerId: "openai",
    modelId: GPT_5_5_MODEL_ID,
    effort: "medium",
    recommendation:
      "Recommended for quality retrieval, complex analysis and Frames",
  },
  {
    providerId: "anthropic",
    modelId: CLAUDE_OPUS_4_8_MODEL_ID,
    effort: "high",
  },
];

// Tooltip shown on the "Auto" row.
const AUTO_TOOLTIP =
  "Dust selects and switches model for cost efficient performance and reliability. When an agent is created using a specific model, we use this model.";

// Per reasoning-effort blurbs shown in each model's hover tooltip: what the
// effort does, and what it is recommended for.
const REASONING_EFFORT_INFO: Record<
  ReasoningEffort,
  { reasoning: string; recommendation: string }
> = {
  none: {
    reasoning: "No additional reasoning, for the fastest responses",
    recommendation: "Recommended for simple, high-volume tasks",
  },
  light: {
    reasoning: "Light reasoning effort, resulting in less tokens produced",
    recommendation:
      "Recommended for easy retrieval, light analysis or general questions",
  },
  medium: {
    reasoning: "Medium reasoning effort, balancing speed and quality",
    recommendation: "Recommended for everyday work and multi-step tasks",
  },
  high: {
    reasoning: "High reasoning effort, producing more tokens",
    recommendation:
      "Recommended for complex, multi-step reasoning and hard problems",
  },
};

// A concrete model + reasoning-effort pair rendered as a single line.
interface ModelLine {
  model: ModelConfigurationType;
  effort: ReasoningEffort;
}

// A suggested line additionally carries the recommendation blurb shown in its
// tooltip. Only suggested lines show a recommendation; "More models" lines do
// not.
interface SuggestedLine extends ModelLine {
  recommendation: string;
}

// The "More models" list grouped by provider, then by model, so it can be
// rendered as a submenu per provider with one section per model.
interface ProviderGroup {
  providerId: ModelProviderIdType;
  models: { model: ModelConfigurationType; efforts: ReasoningEffort[] }[];
}

// Either "Auto" (follow the agent's configured model, i.e. no override) or a
// concrete model + reasoning-effort pick.
type Selection =
  | { kind: "auto" }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

// The reasoning efforts a user can actually pick for a model. "none" means "no
// reasoning"; when a model also supports real reasoning efforts we drop the bare
// "none" option so the user has to pick an explicit effort rather than "just the
// model" (e.g. no plain "GPT-5.4 Mini" when Light/Medium/High exist). "none" is
// only offered when it is the model's sole supported effort.
function getSelectableReasoningEfforts(
  model: ModelConfigurationType
): ReasoningEffort[] {
  const efforts = getAvailableReasoningEfforts(model.supportedReasoningEfforts);
  const withReasoning = efforts.filter((effort) => effort !== "none");
  return withReasoning.length > 0 ? withReasoning : efforts;
}

// A model + effort combo identity. `modelId` is not unique across providers, and
// the same model appears once per reasoning effort, so key on all three. Used for
// radio values and de-duplicating pinned combos out of the "More models" list.
function getLineKey(
  providerId: string,
  modelId: string,
  effort: ReasoningEffort
): string {
  return `${providerId}/${modelId}/${effort}`;
}

// e.g. "Light", "Medium", "High". "none" has no meaningful label.
function capitalizeEffort(effort: ReasoningEffort): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

// e.g. "Claude Sonnet 4.6 High". Models with no reasoning effort ("none") show
// just their display name.
function getLineLabel(selection: Selection): string {
  if (selection.kind === "auto") {
    return "Auto";
  }
  const { model, effort } = selection;

  if (effort === "none") {
    return model.displayName;
  }

  return `${model.displayName} ${capitalizeEffort(effort)}`;
}

// Converts the picker's local selection into the API model selection sent on
// message send. "Auto" means no override (run the agent's configured model),
// i.e. undefined.
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

interface InputBarModelPickerProps {
  agentModel: AgentModelConfigurationType | null;
  owner: LightWorkspaceType;
  buttonSize: "xs" | "sm";
  // Which side the dropdown opens toward. Mirrors the agent picker: "top" in an
  // active conversation (input bar pinned to the bottom), "bottom" on the new
  // conversation screen where there is room below.
  side?: "top" | "bottom";
  disabled?: boolean;
  // Notified with the API model selection whenever the picker changes (including
  // resets), so the parent can attach it to the next message send. `undefined`
  // means no override (run the agent's configured model).
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
  // The list of models is hidden while "Auto" is on; toggling Auto off (or
  // searching) reveals it without yet committing a model pick.
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "auto" });

  // Reset to Auto when the agent changes: a per-message override should not leak
  // across agents.
  const agentModelKey = agentModel
    ? `${agentModel.providerId}/${agentModel.modelId}`
    : null;
  const [prevAgentModelKey, setPrevAgentModelKey] = useState(agentModelKey);
  if (agentModelKey !== prevAgentModelKey) {
    setPrevAgentModelKey(agentModelKey);
    setSelection({ kind: "auto" });
    setExpanded(false);
  }

  // Keep the parent in sync with the current selection (including the reset
  // above) so it can attach the override to the next message send.
  useEffect(() => {
    onSelectionChange?.(toModelSelection(selection));
  }, [selection, onSelectionChange]);

  const { models, isModelsLoading } = useModels({
    owner,
    disabled: !hasModelsPicker,
  });

  // Every model expanded into one line per available reasoning effort.
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
            recommendation:
              pin.recommendation ??
              REASONING_EFFORT_INFO[pin.effort].recommendation,
          },
        ];
      }),
    [models]
  );

  // "More models" lists every model/effort grouped by provider then model,
  // preserving encounter order, so it can be rendered as one submenu per provider
  // with one section per model. Models pinned in "Suggested" are intentionally
  // still shown here too.
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

  // Clicking anywhere on the Auto row toggles it: off reveals the model list
  // (without committing a pick yet), on resets back to the agent's model.
  const toggleAuto = () => {
    if (isAutoOn) {
      setExpanded(true);
    } else {
      setSelection({ kind: "auto" });
      setExpanded(false);
    }
  };

  if (!hasModelsPicker) {
    return null;
  }

  // A model line rendered with the model name and the reasoning effort shown as a
  // badge to the right. No provider logo. Reused across the "Suggested" section,
  // flat search results, and the provider submenus.
  const renderModelLine = (line: ModelLine, recommendation?: string) => {
    const key = getLineKey(
      line.model.providerId,
      line.model.modelId,
      line.effort
    );
    const info = REASONING_EFFORT_INFO[line.effort];
    return (
      <DropdownTooltipTrigger
        key={key}
        description={recommendation ?? ""}
        media={
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
          </div>
        }
      >
        <DropdownMenuRadioItem
          value={key}
          onClick={() =>
            setSelection({
              kind: "model",
              model: line.model,
              effort: line.effort,
            })
          }
        >
          <span className="flex grow items-center gap-2">
            <span className="line-clamp-1">{line.model.displayName}</span>
            {line.effort !== "none" && (
              <Chip size="mini" label={capitalizeEffort(line.effort)} />
            )}
          </span>
        </DropdownMenuRadioItem>
      </DropdownTooltipTrigger>
    );
  };

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

        {showAuto && (
          <DropdownTooltipTrigger description={AUTO_TOOLTIP}>
            <DropdownMenuItem
              label="Auto"
              endComponent={<SliderToggle size="xs" selected={isAutoOn} />}
              onClick={toggleAuto}
              onSelect={(e) => e.preventDefault()}
            />
          </DropdownTooltipTrigger>
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
                  {moreByProvider.map((provider) => (
                    <DropdownMenuSub key={provider.providerId}>
                      <DropdownMenuSubTrigger
                        label={getProviderDisplayName(provider.providerId)}
                        icon={getModelProviderLogo(provider.providerId, isDark)}
                      />
                      <DropdownMenuSubContent>
                        {provider.models.map((entry, index) => (
                          <Fragment key={entry.model.modelId}>
                            {index > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuLabel
                              label={entry.model.displayName}
                            />
                            <DropdownMenuRadioGroup value={selectedKey}>
                              {entry.efforts.map((effort) =>
                                renderModelLine({ model: entry.model, effort })
                              )}
                            </DropdownMenuRadioGroup>
                          </Fragment>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ))}
                </>
              )}
            </>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
