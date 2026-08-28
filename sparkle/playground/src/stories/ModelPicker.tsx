import { ModelPickerContent } from "@app/components/model_picker/ModelPickerContent";
import type {
  MakerGroup,
  ModelPickerView,
  ModelTierId,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  getInitialEffort,
} from "@app/components/model_picker/modelPickerUtils";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

// Everything the real ModelPicker gets from SWR/auth, faked here so the
// dropdown itself is the only moving part.
const ALL_MODELS: ModelConfigurationType[] = SUPPORTED_MODEL_CONFIGS.filter(
  (model) => !model.modelId.startsWith("auto")
);

const STREAM_MODELS: EnabledModelConfigurationType[] =
  SUPPORTED_MODEL_CONFIGS.filter((model) =>
    model.modelId.startsWith("auto")
  ).map((model) => ({ ...model, isSelectable: true }));

const STREAMS = {
  auto_fast: {
    providerId: "anthropic",
    modelId: "claude-haiku",
    displayName: "Claude Haiku",
    reasoningEffort: "none",
  },
  auto: {
    providerId: "anthropic",
    modelId: "claude-sonnet",
    displayName: "Claude Sonnet",
    reasoningEffort: "medium",
  },
  auto_complex: {
    providerId: "anthropic",
    modelId: "claude-opus",
    displayName: "Claude Opus",
    reasoningEffort: "high",
  },
} as unknown as ModelStreamResolutionsType;

function ModelPickerHarness() {
  // Same drill-down state machine as `ModelPicker`, kept here so the story
  // exercises the real navigation without the auth/SWR wrapper.
  const [isOpen, setIsOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ModelPickerView>("root");
  const [activeMaker, setActiveMaker] = useState<ModelMakerIdType | null>(null);

  const agentDefault: Selection = useMemo(
    () => ({
      display: { kind: "tier", tierId: "standard" },
      toSend: undefined,
    }),
    []
  );
  const [shown, setShown] = useState<Selection>(agentDefault);

  const makerGroups = useMemo<MakerGroup[]>(() => {
    const groups = new Map<ModelMakerIdType, ModelConfigurationType[]>();
    for (const model of ALL_MODELS) {
      const makerId = getModelMaker(model);
      const existing = groups.get(makerId);
      if (existing) {
        existing.push(model);
      } else {
        groups.set(makerId, [model]);
      }
    }
    return Array.from(groups.entries()).map(([makerId, models]) => ({
      makerId,
      models,
    }));
  }, []);

  const lastInteractionAtMsRef = useRef(0);
  const shouldBlockDismiss = () =>
    Date.now() - lastInteractionAtMsRef.current < 300;

  const onSelectTier = (tierId: ModelTierId) =>
    setShown({
      display: { kind: "tier", tierId },
      toSend: buildTierSelection(tierId),
    });

  const onSelectModel = (model: ModelConfigurationType) => {
    lastInteractionAtMsRef.current = Date.now();
    const effort = getInitialEffort(model);
    setShown({
      display: { kind: "model", model, effort },
      toSend: buildModelSelection(model, effort),
    });
  };

  const onChangeEffort = (effort: ReasoningEffort) => {
    lastInteractionAtMsRef.current = Date.now();
    setShown((current) =>
      current.display.kind === "model"
        ? {
            display: { ...current.display, effort },
            toSend: buildModelSelection(current.display.model, effort),
          }
        : current
    );
  };

  const onBack = () => {
    if (view === "models") {
      setActiveMaker(null);
      setView("makers");
    } else if (view === "makers") {
      setSearch("");
      setView("root");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-16">
      <div className="text-sm text-muted-foreground">
        Selected:{" "}
        <span className="font-medium text-foreground">
          {shown.display.kind === "tier"
            ? shown.display.tierId
            : `${shown.display.model.displayName} (${shown.display.effort})`}
        </span>
      </div>

      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && shouldBlockDismiss()) {
            return;
          }
          if (open) {
            setSearch("");
            setView("root");
            setActiveMaker(null);
          }
          setIsOpen(open);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" label="Model picker" />
        </DropdownMenuTrigger>
        <ModelPickerContent
          side="bottom"
          shouldBlockDismiss={shouldBlockDismiss}
          shown={shown}
          agentDefault={agentDefault}
          canRevert={shown !== agentDefault}
          lockPremiumEfforts={false}
          makerGroups={makerGroups}
          allModels={ALL_MODELS}
          streamModels={STREAM_MODELS}
          streams={STREAMS}
          search={search}
          onSearchChange={setSearch}
          view={view}
          activeMaker={activeMaker}
          onOpenMakers={() => {
            setSearch("");
            setView("makers");
          }}
          onSelectMaker={(makerId) => {
            setActiveMaker(makerId);
            setView("models");
          }}
          onBack={onBack}
          onSelectTier={onSelectTier}
          onSelectModel={onSelectModel}
          onChangeEffort={onChangeEffort}
          onRevert={() => setShown(agentDefault)}
        />
      </DropdownMenu>
    </div>
  );
}

export default function ModelPickerStory() {
  return (
    <ThemeProvider>
      <ModelPickerHarness />
    </ThemeProvider>
  );
}
