import { ContextItem, Modal, SliderToggle } from "@dust-tt/sparkle";
import type { ModelProviderIdType, WorkspaceType } from "@dust-tt/types";
import { MODEL_PROVIDER_IDS, SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import { isEqual } from "lodash";
import { useCallback, useMemo, useState } from "react";

import { MODEL_PROVIDER_LOGOS } from "@app/components/providers/types";

interface ModelManagementModalProps {
  owner: WorkspaceType;
  showProviderModal: boolean;
  onClose: () => void;
  onSave: (updateProviders: ModelProviderIdType[]) => void;
}

type ProviderStates = Record<ModelProviderIdType, boolean>;

const prettyfiedProviderNames: { [key in ModelProviderIdType]: string } = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
};

const providerModels = SUPPORTED_MODEL_CONFIGS.reduce((acc, model) => {
  if (!model.isLegacy) {
    if (!acc[model.providerId]) {
      acc[model.providerId] = [];
    }
    acc[model.providerId].push(model.displayName);
  }
  return acc;
}, {} as Record<ModelProviderIdType, string[]>);

// TODO: Jules 06/06/2024: use selection modal in workspace/index.tsx once Model Deactivation ready
export function ProviderManagementModal({
  owner,
  showProviderModal,
  onClose,
  onSave,
}: ModelManagementModalProps) {
  const initialProviderStates = useMemo(() => {
    const enabledProviders: ModelProviderIdType[] =
      owner.whiteListedProviders ?? [...MODEL_PROVIDER_IDS];
    const initialProviderStates: ProviderStates = [
      ...MODEL_PROVIDER_IDS,
    ].reduce((acc, provider) => {
      acc[provider] = enabledProviders.includes(provider);
      return acc;
    }, {} as ProviderStates);
    return initialProviderStates;
  }, [owner.whiteListedProviders]);

  const [providerStates, setProviderStates] = useState<ProviderStates>(
    initialProviderStates
  );
  const allToggleEnabled = Object.values(providerStates).every(Boolean);

  const handleToggleChange = useCallback(
    (provider: ModelProviderIdType) => {
      setProviderStates((prevStates) => ({
        ...prevStates,
        [provider]: !prevStates[provider],
      }));
    },
    [setProviderStates]
  );
  return (
    <Modal
      isOpen={showProviderModal}
      onClose={onClose}
      hasChanged={!isEqual(providerStates, initialProviderStates)}
      title="Manage Providers"
      saveLabel="Update providers"
      onSave={() => {
        const activeProviders = MODEL_PROVIDER_IDS.filter(
          (key) => providerStates[key]
        );
        onSave(activeProviders);
      }}
    >
      <div className="mt-8 divide-y divide-gray-200">
        <div className="flex items-center justify-between px-4 pb-4">
          <span className="text-left font-bold text-element-900">
            Make all providers available
          </span>
          <SliderToggle
            size="sm"
            selected={allToggleEnabled}
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
                    {providerModels[provider].join(", ")}
                  </span>
                </ContextItem.Description>
              </ContextItem>
            );
          })}
        </ContextItem.List>
      </div>
    </Modal>
  );
}
