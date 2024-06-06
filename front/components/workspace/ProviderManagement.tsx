import { ContextItem, Modal, SliderToggle } from "@dust-tt/sparkle";
import type { ModelProviderIdType, WorkspaceType } from "@dust-tt/types";
import { SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import { MODEL_PROVIDER_IDS } from "@dust-tt/types";
import { useState } from "react";

import { MODEL_PROVIDER_LOGOS } from "@app/components/assistant_builder/InstructionScreen";

interface ModelSelectionModalProps {
  owner: WorkspaceType;
  showProviderModal: boolean;
  onClose: () => void;
  onSave: (updateProviders: ModelProviderIdType[]) => void;
}

type ProviderStates = Record<ModelProviderIdType, boolean>;

const prettyfiedProviderNames: { [key in ModelProviderIdType]: string } = {
  openai: "Open AI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
};

// TODO: Jules 06/06/2024: use selection modal in workspace/index.tsx once Model Deactivation ready
export function ProviderSelectionModal({
  owner,
  showProviderModal,
  onClose,
  onSave,
}: ModelSelectionModalProps) {
  const enabledProviders: ModelProviderIdType[] =
    owner.whiteListedProviders ?? [...MODEL_PROVIDER_IDS];
  const initialProviderStates: ProviderStates = enabledProviders.reduce(
    (acc, provider) => {
      acc[provider] = true;
      return acc;
    },
    {} as ProviderStates
  );
  const [providerStates, setProviderStates] = useState<ProviderStates>(
    initialProviderStates
  );

  const handleToggleChange = (provider: ModelProviderIdType) => {
    setProviderStates((prevStates) => ({
      ...prevStates,
      [provider]: !prevStates[provider],
    }));
  };
  return (
    <Modal
      isOpen={showProviderModal}
      onClose={onClose}
      hasChanged={
        JSON.stringify(providerStates) !== JSON.stringify(initialProviderStates)
      }
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
        <div className="flex items-center justify-between pb-4">
          <span className="text-left font-bold text-element-900">
            Make all providers available
          </span>
          <SliderToggle
            size="sm"
            selected={Object.values(providerStates).every(Boolean)}
            onClick={() => {
              const allEnabled = Object.values(providerStates).every(Boolean);
              setProviderStates(
                MODEL_PROVIDER_IDS.reduce((acc, provider) => {
                  acc[provider] = !allEnabled;
                  return acc;
                }, {} as ProviderStates)
              );
            }}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <ContextItem.List>
          {MODEL_PROVIDER_IDS.map((provider) => {
            const LogoComponent = MODEL_PROVIDER_LOGOS[provider];
            LogoComponent.defaultProps = { className: "h-8 w-8" };

            const providerModels = SUPPORTED_MODEL_CONFIGS.filter(
              (config) => config.providerId === provider
            );
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
                  {providerModels.map((model) => (
                    <div key={model.modelId} className="mt-2">
                      <div className="text-sm text-element-700">
                        {model.displayName}
                      </div>
                    </div>
                  ))}
                </ContextItem.Description>
              </ContextItem>
            );
          })}
        </ContextItem.List>
      </div>
    </Modal>
  );
}
