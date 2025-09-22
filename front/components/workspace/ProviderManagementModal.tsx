import {
  Button,
  Cog6ToothIcon,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SliderToggle,
} from "@dust-tt/sparkle";
import isEqual from "lodash/isEqual";
import uniqBy from "lodash/uniqBy";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getModelProviderLogo,
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { canUseModel } from "@app/lib/assistant";
import { useFeatureFlags, useWorkspace } from "@app/lib/swr/workspaces";
import type { ModelProviderIdType, PlanType, WorkspaceType } from "@app/types";
import { EMBEDDING_PROVIDER_IDS, MODEL_PROVIDER_IDS } from "@app/types";

type ProviderStates = Record<ModelProviderIdType, boolean>;

const prettyfiedProviderNames: { [key in ModelProviderIdType]: string } = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
  togetherai: "TogetherAI",
  deepseek: "Deepseek",
  fireworks: "Fireworks",
  xai: "xAI",
};

interface ProviderManagementModalProps {
  owner: WorkspaceType;
  plan: PlanType;
}

export function ProviderManagementModal({
  owner,
  plan,
}: ProviderManagementModalProps) {
  const { isDark } = useTheme();
  const sendNotifications = useSendNotification();

  const [open, setOpen] = useState(false);

  const {
    workspace,
    isWorkspaceLoading,
    isWorkspaceValidating,
    mutateWorkspace,
  } = useWorkspace({
    owner,
    disabled: !open,
  });

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
    disabled: !open,
  });

  // Filter models based on feature flags and build modelProviders dynamically
  const filteredModels = uniqBy(
    [...USED_MODEL_CONFIGS, ...REASONING_MODEL_CONFIGS],
    (m) => m.modelId
  ).filter(
    (model) => !model.isLegacy && canUseModel(model, featureFlags, plan, owner)
  );

  const modelProviders = filteredModels.reduce(
    (acc, model) => {
      acc[model.providerId] = acc[model.providerId] || [];
      acc[model.providerId].push(model.displayName);
      return acc;
    },
    {} as Record<ModelProviderIdType, string[]>
  );

  // These two represent the local state
  const [providerStates, setProviderStates] = useState<ProviderStates>(
    {} as ProviderStates
  );
  const [embeddingProvider, setDefaultEmbeddingProvider] =
    useState<ModelProviderIdType | null>(null);

  // This is the initial state, and reflects what in the database
  const initialProviderStates = useMemo(() => {
    const enabledProviders: ModelProviderIdType[] =
      workspace?.whiteListedProviders ?? [...MODEL_PROVIDER_IDS];
    const states = MODEL_PROVIDER_IDS.reduce((acc, provider) => {
      acc[provider] = enabledProviders.includes(provider);
      return acc;
    }, {} as ProviderStates);
    return states;
  }, [workspace]);

  useEffect(() => {
    if (open) {
      setProviderStates(initialProviderStates);
      setDefaultEmbeddingProvider(workspace?.defaultEmbeddingProvider ?? null);
    }
  }, [open, initialProviderStates, workspace?.defaultEmbeddingProvider]);

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

        // Retrigger a server fetch after a successful update
        await mutateWorkspace();
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
    embeddingProvider !== workspace?.defaultEmbeddingProvider;

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" label="Manage Models" icon={Cog6ToothIcon} />
      </SheetTrigger>
      <SheetContent size="lg">
        <SheetHeader hideButton>
          <SheetTitle>Manage Providers</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="mt-8 divide-y divide-gray-200 dark:divide-gray-200-night">
            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-left font-bold text-foreground dark:text-foreground-night">
                Make all providers available
              </span>
              <SliderToggle
                size="xs"
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
                const LogoComponent = getModelProviderLogo(provider, isDark);
                if (!modelProviders[provider]) {
                  return null;
                }
                return (
                  <ContextItem
                    key={provider}
                    title={prettyfiedProviderNames[provider]}
                    visual={<Icon visual={LogoComponent} size="lg" />}
                    action={
                      <SliderToggle
                        size="xs"
                        selected={providerStates[provider]}
                        onClick={() => handleToggleChange(provider)}
                        disabled={isWorkspaceLoading || isWorkspaceValidating}
                      />
                    }
                  >
                    <ContextItem.Description>
                      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
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
            your data powering the semantic search capabilities of your agents.
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
