import { cn } from "@app/components/poke/shadcn/lib/utils";
import { DEGRADABLE_MODEL_CONFIGS } from "@app/lib/poke/degradable_models";
import { useUpdatePokeDegradedModels } from "@app/poke/swr/kill";
import {
  getProviderDisplayName,
  MODEL_PROVIDER_IDS,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface ProviderGroup {
  providerId: ModelProviderIdType;
  displayName: string;
  models: ModelConfigurationType[];
}

// Degradable models grouped by provider, in the canonical provider order. Built
// once: the catalog is a build-time constant.
const PROVIDER_GROUPS: ProviderGroup[] = MODEL_PROVIDER_IDS.map(
  (providerId) => ({
    providerId,
    displayName: getProviderDisplayName(providerId),
    models: DEGRADABLE_MODEL_CONFIGS.filter((m) => m.providerId === providerId),
  })
).filter((group) => group.models.length > 0);

interface DegradedModelsFormValues {
  degradedModelIds: string[];
}

function sameModelIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);

  return b.every((modelId) => aSet.has(modelId));
}

function displayNameForModelId(modelId: string): string {
  return (
    DEGRADABLE_MODEL_CONFIGS.find((m) => m.modelId === modelId)?.displayName ??
    modelId
  );
}

interface DegradedModelsDialogProps {
  degradedModelIds: string[];
  onSaved: () => Promise<void>;
}

export function DegradedModelsDialog({
  degradedModelIds,
  onSaved,
}: DegradedModelsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          label={
            degradedModelIds.length === 0
              ? "Manage"
              : `${degradedModelIds.length} degraded`
          }
        />
      </DialogTrigger>
      <DialogContent size="xl" height="xl">
        <DialogHeader>
          <DialogTitle>Degraded models</DialogTitle>
          <DialogDescription>
            Take a model out of the auto streams for every workspace in this
            region: Basic, Standard and Premium skip it and pick the next
            candidate in their pool instead.
          </DialogDescription>
          <DialogDescription>
            Nothing else changes. An agent configured on the model, and a user
            who picks it from the model picker, keep running on it -- a
            definitive pick is never silently swapped for another model.
          </DialogDescription>
          <DialogDescription>
            Per-region: to take a model out of the streams everywhere, do it
            again from the other region.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <DegradedModelsEditor
            degradedModelIds={degradedModelIds}
            onCancel={() => setOpen(false)}
            onSaved={async () => {
              await onSaved();
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DegradedModelsEditorProps {
  degradedModelIds: string[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function DegradedModelsEditor({
  degradedModelIds,
  onCancel,
  onSaved,
}: DegradedModelsEditorProps) {
  const updateDegradedModels = useUpdatePokeDegradedModels();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DegradedModelsFormValues>({
    defaultValues: { degradedModelIds },
  });
  const selected = form.watch("degradedModelIds");
  const selectedSet = new Set(selected);

  // The switches are refetched while the dialog is open, so re-seed the form
  // when the server state changes under it — unless the operator already has
  // pending edits, which must not be thrown away.
  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({ degradedModelIds });
    }
  }, [form, degradedModelIds]);

  const setSelected = (modelIds: string[]) => {
    form.setValue("degradedModelIds", modelIds, { shouldDirty: true });
  };

  const toggleModel = (modelId: string, degraded: boolean) => {
    setSelected(
      degraded
        ? [...selected, modelId]
        : selected.filter((id) => id !== modelId)
    );
  };

  const toggleProvider = (group: ProviderGroup, degraded: boolean) => {
    const groupModelIds = new Set<string>(group.models.map((m) => m.modelId));
    const withoutGroup = selected.filter((id) => !groupModelIds.has(id));

    setSelected(degraded ? [...withoutGroup, ...groupModelIds] : withoutGroup);
  };

  const hasChanges = !sameModelIds(selected, degradedModelIds);

  const onSubmit = form.handleSubmit(async ({ degradedModelIds: nextIds }) => {
    const newlyDegraded = nextIds.filter(
      (id) => !degradedModelIds.includes(id)
    );
    const restored = degradedModelIds.filter((id) => !nextIds.includes(id));

    const summary = [
      newlyDegraded.length > 0 &&
        `Degrade: ${newlyDegraded.map(displayNameForModelId).join(", ")}`,
      restored.length > 0 &&
        `Restore: ${restored.map(displayNameForModelId).join(", ")}`,
    ]
      .filter((line) => typeof line === "string")
      .join("\n");

    if (!window.confirm(`Apply these degraded models?\n\n${summary}`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (await updateDegradedModels(nextIds)) {
        await onSaved();
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogContainer>
        <div className="space-y-6">
          {PROVIDER_GROUPS.map((group) => {
            const degradedInGroup = group.models.filter((m) =>
              selectedSet.has(m.modelId)
            ).length;
            const allDegraded = degradedInGroup === group.models.length;

            return (
              <div key={group.providerId} className="space-y-3">
                <div
                  className={cn(
                    "flex items-center justify-between gap-2",
                    "border-b border-border pb-2"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id={`provider-${group.providerId}`}
                      checked={
                        allDegraded
                          ? true
                          : degradedInGroup > 0
                            ? "partial"
                            : false
                      }
                      onCheckedChange={() =>
                        toggleProvider(group, !allDegraded)
                      }
                    />
                    <Label
                      htmlFor={`provider-${group.providerId}`}
                      className="cursor-pointer text-sm font-semibold"
                    >
                      {group.displayName}
                    </Label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {degradedInGroup} / {group.models.length} degraded
                  </span>
                </div>

                <div className="grid gap-3 pl-1 sm:grid-cols-2">
                  {group.models.map((model) => (
                    <div
                      key={model.modelId}
                      className="flex items-center gap-2.5"
                    >
                      <Checkbox
                        id={`model-${model.modelId}`}
                        checked={selectedSet.has(model.modelId)}
                        onCheckedChange={(checked) =>
                          toggleModel(model.modelId, checked === true)
                        }
                      />
                      <Label
                        htmlFor={`model-${model.modelId}`}
                        className="cursor-pointer text-sm"
                      >
                        {model.displayName}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContainer>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          label="Cancel"
          disabled={isSubmitting}
          onClick={onCancel}
        />
        <Button
          type="submit"
          variant="warning"
          label="Save"
          disabled={!hasChanges || isSubmitting}
          isLoading={isSubmitting}
        />
      </DialogFooter>
    </form>
  );
}
