import { cn } from "@app/components/poke/shadcn/lib/utils";
import { KILLABLE_MODEL_CONFIGS } from "@app/lib/poke/killable_models";
import { useUpdatePokeKilledModels } from "@app/poke/swr/kill";
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

// Killable models grouped by provider, in the canonical provider order. Built
// once: the catalog is a build-time constant.
const PROVIDER_GROUPS: ProviderGroup[] = MODEL_PROVIDER_IDS.map(
  (providerId) => ({
    providerId,
    displayName: getProviderDisplayName(providerId),
    models: KILLABLE_MODEL_CONFIGS.filter((m) => m.providerId === providerId),
  })
).filter((group) => group.models.length > 0);

interface KilledModelsFormValues {
  killedModelIds: string[];
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
    KILLABLE_MODEL_CONFIGS.find((m) => m.modelId === modelId)?.displayName ??
    modelId
  );
}

interface ModelKillSwitchesDialogProps {
  killedModelIds: string[];
  onSaved: () => Promise<void>;
}

export function ModelKillSwitchesDialog({
  killedModelIds,
  onSaved,
}: ModelKillSwitchesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          label={
            killedModelIds.length === 0
              ? "Manage"
              : `${killedModelIds.length} killed`
          }
        />
      </DialogTrigger>
      <DialogContent size="xl" height="xl">
        <DialogHeader>
          <DialogTitle>Model kill switches</DialogTitle>
          <DialogDescription>
            Take a model out of rotation for every workspace in this region.
            Nothing routes onto it any more: the auto streams pick the next
            candidate in their pool, and it shows as unavailable in the picker.
            An agent or a user already pinned to it gets their message posted,
            then a "model unavailable" error on the answer.
          </DialogDescription>
          <DialogDescription>
            Kill switches are per-region: to take a model out everywhere, do it
            again from the other region.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ModelKillSwitchesEditor
            killedModelIds={killedModelIds}
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

interface ModelKillSwitchesEditorProps {
  killedModelIds: string[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function ModelKillSwitchesEditor({
  killedModelIds,
  onCancel,
  onSaved,
}: ModelKillSwitchesEditorProps) {
  const updateKilledModels = useUpdatePokeKilledModels();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<KilledModelsFormValues>({
    defaultValues: { killedModelIds },
  });
  const selected = form.watch("killedModelIds");
  const selectedSet = new Set(selected);

  // The switches are refetched while the dialog is open, so re-seed the form
  // when the server state changes under it — unless the operator already has
  // pending edits, which must not be thrown away.
  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({ killedModelIds });
    }
  }, [form, killedModelIds]);

  const setSelected = (modelIds: string[]) => {
    form.setValue("killedModelIds", modelIds, { shouldDirty: true });
  };

  const toggleModel = (modelId: string, killed: boolean) => {
    setSelected(
      killed ? [...selected, modelId] : selected.filter((id) => id !== modelId)
    );
  };

  const toggleProvider = (group: ProviderGroup, killed: boolean) => {
    const groupModelIds = new Set<string>(group.models.map((m) => m.modelId));
    const withoutGroup = selected.filter((id) => !groupModelIds.has(id));

    setSelected(killed ? [...withoutGroup, ...groupModelIds] : withoutGroup);
  };

  const hasChanges = !sameModelIds(selected, killedModelIds);

  const onSubmit = form.handleSubmit(async ({ killedModelIds: nextIds }) => {
    const newlyKilled = nextIds.filter((id) => !killedModelIds.includes(id));
    const revived = killedModelIds.filter((id) => !nextIds.includes(id));

    const summary = [
      newlyKilled.length > 0 &&
        `Kill: ${newlyKilled.map(displayNameForModelId).join(", ")}`,
      revived.length > 0 &&
        `Revive: ${revived.map(displayNameForModelId).join(", ")}`,
    ]
      .filter((line) => typeof line === "string")
      .join("\n");

    if (!window.confirm(`Apply these model kill switches?\n\n${summary}`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (await updateKilledModels(nextIds)) {
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
            const killedInGroup = group.models.filter((m) =>
              selectedSet.has(m.modelId)
            ).length;
            const allKilled = killedInGroup === group.models.length;

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
                        allKilled ? true : killedInGroup > 0 ? "partial" : false
                      }
                      onCheckedChange={() => toggleProvider(group, !allKilled)}
                    />
                    <Label
                      htmlFor={`provider-${group.providerId}`}
                      className="cursor-pointer text-sm font-semibold"
                    >
                      {group.displayName}
                    </Label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {killedInGroup} / {group.models.length} killed
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
