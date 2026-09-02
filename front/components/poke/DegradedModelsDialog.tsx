import { cn } from "@app/components/poke/shadcn/lib/utils";
import type { DegradedModelEndpointStatusType } from "@app/lib/api/poke/degraded_models";
import { degradedModelEndpointKey } from "@app/lib/model_constructors/types/degradations";
import { useUpdatePokeDegradedModels } from "@app/poke/swr/degraded_models";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
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
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface ModelGroup {
  modelId: ModelIdType;
  displayName: string;
  endpoints: DegradedModelEndpointStatusType[];
}

interface ProviderGroup {
  providerId: ModelProviderIdType;
  displayName: string;
  models: ModelGroup[];
  endpointKeys: string[];
}

// The catalog grouped provider -> model -> host, preserving the order the API
// returns it in.
function groupEndpoints(
  endpoints: DegradedModelEndpointStatusType[]
): ProviderGroup[] {
  const providers = new Map<
    ModelProviderIdType,
    Map<ModelIdType, ModelGroup>
  >();

  for (const endpoint of endpoints) {
    const models =
      providers.get(endpoint.providerId) ?? new Map<ModelIdType, ModelGroup>();
    const model = models.get(endpoint.modelId) ?? {
      modelId: endpoint.modelId,
      displayName: endpoint.displayName,
      endpoints: [],
    };

    model.endpoints.push(endpoint);
    models.set(endpoint.modelId, model);
    providers.set(endpoint.providerId, models);
  }

  return [...providers.entries()].map(([providerId, models]) => {
    const modelGroups = [...models.values()];

    return {
      providerId,
      displayName: getProviderDisplayName(providerId),
      models: modelGroups,
      endpointKeys: modelGroups.flatMap((model) =>
        model.endpoints.map(degradedModelEndpointKey)
      ),
    };
  });
}

interface DegradedModelsFormValues {
  degradedEndpointKeys: string[];
}

function sameKeys(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);

  return b.every((key) => aSet.has(key));
}

interface DegradedModelsDialogProps {
  endpoints: DegradedModelEndpointStatusType[];
  onSaved: () => Promise<void>;
}

export function DegradedModelsDialog({
  endpoints,
  onSaved,
}: DegradedModelsDialogProps) {
  const [open, setOpen] = useState(false);
  const degradedCount = endpoints.filter(
    (endpoint) => endpoint.degraded
  ).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          label={degradedCount === 0 ? "Manage" : `${degradedCount} degraded`}
        />
      </DialogTrigger>
      <DialogContent size="xl" height="xl">
        <DialogHeader>
          <DialogTitle>Degraded models</DialogTitle>
          <DialogDescription>
            Flag the endpoints hit by a provider incident. A model is taken out
            of the auto streams for every workspace in this region as soon as
            one of its endpoints is degraded: Basic, Standard and Premium skip
            it and pick the next candidate in their pool instead.
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
            endpoints={endpoints}
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
  endpoints: DegradedModelEndpointStatusType[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}

function DegradedModelsEditor({
  endpoints,
  onCancel,
  onSaved,
}: DegradedModelsEditorProps) {
  const updateDegradedModels = useUpdatePokeDegradedModels();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const providerGroups = useMemo(() => groupEndpoints(endpoints), [endpoints]);
  const endpointByKey = useMemo(
    () =>
      new Map(
        endpoints.map((endpoint) => [
          degradedModelEndpointKey(endpoint),
          endpoint,
        ])
      ),
    [endpoints]
  );
  const degradedEndpointKeys = useMemo(
    () =>
      endpoints
        .filter((endpoint) => endpoint.degraded)
        .map(degradedModelEndpointKey),
    [endpoints]
  );

  const form = useForm<DegradedModelsFormValues>({
    defaultValues: { degradedEndpointKeys },
  });
  const selected = form.watch("degradedEndpointKeys");
  const selectedSet = new Set(selected);

  // The degraded set is refetched while the dialog is open, so re-seed the form
  // when the server state changes under it — unless the operator already has
  // pending edits, which must not be thrown away.
  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({ degradedEndpointKeys });
    }
  }, [form, degradedEndpointKeys]);

  const setSelected = (keys: string[]) => {
    form.setValue("degradedEndpointKeys", keys, { shouldDirty: true });
  };

  const toggleKeys = (keys: string[], degraded: boolean) => {
    const toggled = new Set(keys);
    const withoutToggled = selected.filter((key) => !toggled.has(key));

    setSelected(degraded ? [...withoutToggled, ...keys] : withoutToggled);
  };

  const hasChanges = !sameKeys(selected, degradedEndpointKeys);

  const labelForKey = (key: string): string => {
    const endpoint = endpointByKey.get(key);

    return endpoint ? `${endpoint.displayName} (${endpoint.host})` : key;
  };

  const onSubmit = form.handleSubmit(
    async ({ degradedEndpointKeys: nextKeys }) => {
      const newlyDegraded = nextKeys.filter(
        (key) => !degradedEndpointKeys.includes(key)
      );
      const restored = degradedEndpointKeys.filter(
        (key) => !nextKeys.includes(key)
      );

      const summary = [
        newlyDegraded.length > 0 &&
          `Degrade: ${newlyDegraded.map(labelForKey).join(", ")}`,
        restored.length > 0 &&
          `Restore: ${restored.map(labelForKey).join(", ")}`,
      ]
        .filter((line) => typeof line === "string")
        .join("\n");

      if (!window.confirm(`Apply these degraded endpoints?\n\n${summary}`)) {
        return;
      }

      // Only what the operator toggled, so a colleague's endpoints survive.
      const updates = [
        ...newlyDegraded.map((key) => ({ key, degraded: true })),
        ...restored.map((key) => ({ key, degraded: false })),
      ]
        .map(({ key, degraded }) => {
          const endpoint = endpointByKey.get(key);

          return endpoint
            ? {
                modelId: endpoint.modelId,
                providerId: endpoint.providerId,
                host: endpoint.host,
                degraded,
              }
            : undefined;
        })
        .filter((update) => update !== undefined);

      setIsSubmitting(true);
      try {
        if (await updateDegradedModels(updates)) {
          await onSaved();
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  );

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogContainer>
        <div className="space-y-6">
          {providerGroups.map((group) => {
            const degradedInGroup = group.endpointKeys.filter((key) =>
              selectedSet.has(key)
            ).length;
            const allDegraded = degradedInGroup === group.endpointKeys.length;

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
                        toggleKeys(group.endpointKeys, !allDegraded)
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
                    {degradedInGroup} / {group.endpointKeys.length} degraded
                  </span>
                </div>

                <div className="grid gap-3 pl-1 sm:grid-cols-2">
                  {group.models.map((model) => (
                    <ModelRow
                      key={model.modelId}
                      model={model}
                      selectedSet={selectedSet}
                      onToggle={toggleKeys}
                    />
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

interface ModelRowProps {
  model: ModelGroup;
  selectedSet: Set<string>;
  onToggle: (keys: string[], degraded: boolean) => void;
}

// A model served from a single host is one checkbox; one served from several
// gets a per-host checkbox under a tri-state parent, so an incident on one host
// can be flagged without touching the others.
function ModelRow({ model, selectedSet, onToggle }: ModelRowProps) {
  const modelKeys = model.endpoints.map(degradedModelEndpointKey);
  const degradedCount = modelKeys.filter((key) => selectedSet.has(key)).length;
  const allDegraded = degradedCount === modelKeys.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`model-${model.modelId}`}
          checked={allDegraded ? true : degradedCount > 0 ? "partial" : false}
          onCheckedChange={() => onToggle(modelKeys, !allDegraded)}
        />
        <Label
          htmlFor={`model-${model.modelId}`}
          className="cursor-pointer text-sm"
        >
          {model.displayName}
        </Label>
      </div>

      {model.endpoints.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-7">
          {model.endpoints.map((endpoint) => {
            const key = degradedModelEndpointKey(endpoint);

            return (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`endpoint-${key}`}
                  checked={selectedSet.has(key)}
                  onCheckedChange={(checked) =>
                    onToggle([key], checked === true)
                  }
                />
                <Label
                  htmlFor={`endpoint-${key}`}
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  {endpoint.host}
                </Label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
