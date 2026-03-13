import { KeyConfigurationSheet } from "@app/components/pages/workspace/model_providers/KeyConfigurationSheet";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContextItem, Icon } from "@dust-tt/sparkle";
import { useState } from "react";

interface ConfigureButtonProps {
  isLoading: boolean;
  apiKey: string | undefined;
  openConfigurationSheet: () => void;
}

function ProviderConfigurationActions({
  isLoading,
  apiKey,
  openConfigurationSheet,
}: ConfigureButtonProps) {
  const configureLabel = apiKey ? "Edit" : "Configure";
  if (isLoading) {
    return null;
  }

  return (
    <Button
      label={configureLabel}
      variant="outline"
      onClick={openConfigurationSheet}
    />
  );
}

interface ProviderConfigurationContextItemProps {
  owner: LightWorkspaceType;
  providerId: ByokModelProviderIdType;
  description: string;
  isLoading: boolean;
  apiKey: string | undefined;
}
export function ProviderConfigurationContextItem({
  owner,
  providerId,
  description,
  isLoading,
  apiKey,
}: ProviderConfigurationContextItemProps) {
  const { isDark } = useTheme();
  const LogoComponent = getModelProviderLogo(providerId, isDark);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <>
      <ContextItem
        key={providerId}
        title={PRETTIFIED_PROVIDER_NAMES[providerId]}
        visual={<Icon visual={LogoComponent} size="lg" />}
        action={
          <ProviderConfigurationActions
            isLoading={isLoading}
            apiKey={apiKey}
            openConfigurationSheet={() => setIsSheetOpen(true)}
          />
        }
      >
        <ContextItem.Description>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </span>
        </ContextItem.Description>
        {apiKey && (
          <div className="font-mono text-lg mt-4 text-foreground dark:text-foreground-night">
            {apiKey}
          </div>
        )}
      </ContextItem>

      <KeyConfigurationSheet
        owner={owner}
        providerId={providerId}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        logo={LogoComponent}
        apiKey={apiKey}
      />
    </>
  );
}
