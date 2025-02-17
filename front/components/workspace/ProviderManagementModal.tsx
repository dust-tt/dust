import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SliderToggle,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { ModelProviderIdType, WorkspaceType } from "@dust-tt/types";
import { EMBEDDING_PROVIDER_IDS, MODEL_PROVIDER_IDS } from "@dust-tt/types";
import { isEqual, uniqBy } from "lodash";
import { useCallback, useMemo, useState } from "react";

import {
  MODEL_PROVIDER_LOGOS,
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";

type ProviderStates = Record<ModelProviderIdType, boolean>;

const prettyfiedProviderNames: { [key in ModelProviderIdType]: string } = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
  togetherai: "TogetherAI",
  deepseek: "Deepseek",
  fireworks: "Fireworks",
};

const modelProviders: Record<ModelProviderIdType, string[]> = uniqBy(
  [...USED_MODEL_CONFIGS, ...REASONING_MODEL_CONFIGS],
  (m) => `${m.providerId}__${m.modelId}`
).reduce(
  (acc, model) => {
    if (!model.isLegacy) {
      acc[model.providerId] = acc[model.providerId] || [];
      acc[model.providerId].push(model.displayName);
    }
    return acc;
  },
  {} as Record<ModelProviderIdType, string[]>
);

interface ProviderManagementModalProps {
  owner: WorkspaceType;
}

export function ProviderManagementModal({
  owner,
}: ProviderManagementModalProps) {
  const sendNotifications = useSendNotification();

  const initialProviderStates: ProviderStates = useMemo(() => {
    const enabledProviders: ModelProviderIdType[] =
      owner.whiteListedProviders ?? [...MODEL_PROVIDER_IDS];
    return MODEL_PROVIDER_IDS.reduce((acc, provider) => {
      acc[provider] = enabledProviders.includes(provider);
      return acc;
    }, {} as ProviderStates);
  }, [owner.whiteListedProviders]);

  const [providerStates, setProviderStates] = useState<ProviderStates>(
    initialProviderStates
  );
  const [embeddingProvider, setDefaultEmbeddingProvider] = useState(
    owner.defaultEmbeddingProvider
  );

  const allToggleEnabled = useMemo(
    () => Object.values(providerStates).every(Boolean),
    [providerStates]
  );

  const masterToggleDisabled = useMemo(
    () => Object.values(providerStates).every((state) => state),
    [providerStates]
  );

  const handleToggleChange = useCallback(
    (provider: ModelProviderIdType) => {
      setProviderStates((prevStates) => ({
        ...prevStates,
        [provider]: !prevStates[provider],
      }));
    },
    [setProviderStates]
  );

  const handleSave = async () => {
    const activeProviders = MODEL_PROVIDER_IDS.filter(
      (key) => providerStates[key]
    );
    if (activeProviders.length === 0) {
      sendNotifications({
        type: "error",
        title: "One provider required",
        description:
          "Please select at least one provider to continue with the update.",
      });
    } else {
      try {
        const response = await fetch(`/api/w/${owner.sId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            whiteListedProviders: activeProviders,
            defaultEmbeddingProvider: embeddingProvider,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update workspace providers");
        }
        sendNotifications({
          type: "success",
          title: "Providers Updated",
          description: "The list of providers has been successfully updated.",
        });
      } catch (error) {
        sendNotifications({
          type: "error",
          title: "Update Failed",
          description: "An unexpected error occurred while updating providers.",
        });
      }
    }
  };

  const hasChanges =
    !isEqual(providerStates, initialProviderStates) ||
    embeddingProvider !== owner.defaultEmbeddingProvider;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="primary" label="Manage providers" className="grow-0" />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader hideButton>
          <SheetTitle>Manage Providers</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="dark:divide-gray-200-night mt-8 divide-y divide-gray-200">
            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-left font-bold text-foreground dark:text-foreground-night">
                Make all providers available
              </span>
              <SliderToggle
                size="sm"
                selected={allToggleEnabled}
                disabled={masterToggleDisabled}
                onClick={() => {
                  setProviderStates(
                    MODEL_PROVIDER_IDS.reduce((acc, provider) => {
                      acc[provider] = !allToggleEnabled;
                      return acc;
                    }, {} as ProviderStates)
                  );
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <ContextItem.List>
              {MODEL_PROVIDER_IDS.map((provider) => {
                const LogoComponent = MODEL_PROVIDER_LOGOS[provider];
                if (!modelProviders[provider]) {
                  return null;
                }
                return (
                  <ContextItem
                    key={provider}
                    title={prettyfiedProviderNames[provider]}
                    visual={<LogoComponent />}
                    action={
                      <SliderToggle
                        size="sm"
                        selected={providerStates[provider]}
                        onClick={() => handleToggleChange(provider)}
                      />
                    }
                  >
                    <ContextItem.Description>
                      <span className="text-sm text-element-700">
                        {modelProviders[provider].join(", ")}
                      </span>
                    </ContextItem.Description>
                  </ContextItem>
                );
              })}
            </ContextItem.List>
          </div>
          <div className="flex flex-row items-center gap-4 px-4 pt-4">
            <div className="text-sm font-semibold">Embedding Provider:</div>
            <DropdownMenu>
              <DropdownMenuTrigger disabled>
                <Button
                  disabled
                  tooltip="Please contact us if you are willing to change this setting."
                  isSelect
                  label={
                    embeddingProvider
                      ? prettyfiedProviderNames[embeddingProvider]
                      : prettyfiedProviderNames["openai"]
                  }
                  variant="outline"
                  size="sm"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {EMBEDDING_PROVIDER_IDS.map((provider) => (
                  <DropdownMenuItem
                    key={provider}
                    label={prettyfiedProviderNames[provider]}
                    onClick={() => {
                      setDefaultEmbeddingProvider(provider);
                    }}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="px-4 pt-2 text-sm text-gray-500">
            Embedding models are used to create numerical representations of
            your data powering the semantic search capabilities of your
            assistants.
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Update providers",
            onClick: handleSave,
            disabled: !hasChanges,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
