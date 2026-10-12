import { getModelById, MODEL_TIERS } from "./data";
import {
  DEFAULT_MODEL_SELECTION,
  ModelPicker,
  type ModelSelection,
  ReasoningEffortPicker,
} from "./ModelPicker";
import { BuilderSection, FieldGroup, FieldRow } from "./SectionContainer";

export function ModelSection({
  selection,
  onChange,
}: {
  selection: ModelSelection;
  onChange: (selection: ModelSelection) => void;
}) {
  // A tier owns its reasoning effort; a specific model exposes it as a row.
  const selectedTier = MODEL_TIERS.find((tier) => tier.id === selection.tierId);
  const summary = selectedTier
    ? selectedTier.label
    : `${getModelById(selection.modelId).displayName} · ${selection.effort}`;

  return (
    <BuilderSection
      title="Model"
      description="The model and reasoning effort behind your agent."
      collapsible
      defaultOpen={selection.modelId !== DEFAULT_MODEL_SELECTION.modelId}
      summary={summary}
    >
      <FieldGroup>
        <FieldRow label="Model">
          <ModelPicker selection={selection} onChange={onChange} />
        </FieldRow>
        {selectedTier ? null : (
          <FieldRow label="Reasoning effort">
            <ReasoningEffortPicker
              modelId={selection.modelId}
              effort={selection.effort}
              onChange={(effort) => onChange({ ...selection, effort })}
            />
          </FieldRow>
        )}
      </FieldGroup>
    </BuilderSection>
  );
}
