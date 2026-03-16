import { KeyConfigurationSheet } from "@app/components/pages/workspace/model_providers/KeyConfigurationSheet";
import { RemoveKeyDialog } from "@app/components/pages/workspace/model_providers/RemoveKeyDialog";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  ContextItem,
  Icon,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface ConfigureButtonProps {
  isLoading: boolean;
  apiKey: string | undefined;
  openConfigurationSheet: () => void;
  openRemoveKeyDialog: () => void;
}

function ProviderConfigurationActions({
  isLoading,
  apiKey,
  openConfigurationSheet,
  openRemoveKeyDialog,
}: ConfigureButtonProps) {
  if (isLoading) {
    return null;
  }

  const configureLabel = apiKey ? "Edit" : "Configure";

  return (
    <div className="flex items-center gap-2">
      <Button
        label={configureLabel}
        variant="outline"
        onClick={openConfigurationSheet}
      />
      {apiKey && (
        <Button
          label="Remove"
          variant="warning"
          onClick={openRemoveKeyDialog}
        />
      )}
    </div>
  );
}

interface ProviderConfigurationContextItemProps {
  owner: LightWorkspaceType;
  providerId: ByokModelProviderIdType;
  description: string;
  isLoading: boolean;
  apiKey: string | undefined;
  isHealthy: boolean | undefined;
}
export function ProviderConfigurationContextItem({
  owner,
  providerId,
  description,
  isLoading,
  apiKey,
  isHealthy,
}: ProviderConfigurationContextItemProps) {
  const { isDark } = useTheme();
  const LogoComponent = getModelProviderLogo(providerId, isDark);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isRemoveKeyDialogOpen, setIsRemoveKeyDialogOpen] = useState(false);

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
            openRemoveKeyDialog={() => setIsRemoveKeyDialogOpen(true)}
          />
        }
      >
        <ContextItem.Description>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </span>
        </ContextItem.Description>

        {apiKey && isHealthy === false && (
          <ContentMessage
            variant="warning"
            icon={InformationCircleIcon}
            title="Invalid API key"
            size="lg"
            className="mt-4"
          >
            This key is no longer valid. Update it to restore affected agents.
          </ContentMessage>
        )}

        {apiKey && (
          <div className="font-mono text-lg mt-4 text-foreground dark:text-foreground-night truncate">
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
      <RemoveKeyDialog
        owner={owner}
        providerId={providerId}
        open={isRemoveKeyDialogOpen}
        onOpenChange={setIsRemoveKeyDialogOpen}
      />
    </>
  );
}
