import { ContextItem, Modal, SliderToggle } from "@dust-tt/sparkle";
import type { ModelProviderIdType, WorkspaceType } from "@dust-tt/types";
import { MODEL_PROVIDER_IDS, SUPPORTED_MODEL_CONFIGS } from "@dust-tt/types";
import { isEqual } from "lodash";
import { useCallback, useContext, useMemo, useState } from "react";

import { MODEL_PROVIDER_LOGOS } from "@app/components/providers/types";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface ModelManagementModalProps {
  owner: WorkspaceType;
  showProviderModal: boolean;
  onClose: () => void;
}

type ProviderStates = Record<ModelProviderIdType, boolean>;

const prettyfiedProviderNames: { [key in ModelProviderIdType]: string } = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral AI",
  google_ai_studio: "Google",
};

const providerModels: Record<ModelProviderIdType, string[]> =
  SUPPORTED_MODEL_CONFIGS.reduce((acc, model) => {
    if (!model.isLegacy) {
      acc[model.providerId] = acc[model.providerId] || [];
      acc[model.providerId].push(model.displayName);
    }
    return acc;
  }, {} as Record<ModelProviderIdType, string[]>);

// TODO: Jules 06/06/2024: use selection modal in workspace/index.tsx once Model Deactivation ready
export function ProviderManagementModal({
  owner,
  showProviderModal,
  onClose,
}: ModelManagementModalProps) {
  const sendNotifications = useContext(SendNotificationsContext);

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
  const allToggleEnabled = useMemo(
    () => Object.values(providerStates).every(Boolean),
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
        onClose();
      } catch (error) {
        sendNotifications({
          type: "error",
          title: "Update Failed",
          description: "An unexpected error occurred while updating providers.",
        });
      }
    }
  };

  return (
    <Modal
      isOpen={showProviderModal}
      onClose={onClose}
      hasChanged={!isEqual(providerStates, initialProviderStates)}
      title="Manage Providers"
      saveLabel="Update providers"
      onSave={handleSave}
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
