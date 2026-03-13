import { KeyConfigurationSheet } from "@app/components/pages/workspace/model_providers/KeyConfigurationSheet";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import { PRETTIFIED_PROVIDER_NAMES } from "@app/types/provider_selection";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContextItem, Icon } from "@dust-tt/sparkle";
import { useState } from "react";

interface ProviderConfigurationContextItemProps {
  owner: LightWorkspaceType;
  providerId: ByokModelProviderIdType;
  description: string;
  isLoading: boolean;
}
export function ProviderConfigurationContextItem({
  owner,
  providerId,
  description,
  isLoading,
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
          !isLoading && (
            <Button
              label="Configure"
              variant="outline"
              onClick={() => setIsSheetOpen(true)}
            />
          )
        }
      >
        <ContextItem.Description>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </span>
        </ContextItem.Description>
      </ContextItem>
      <KeyConfigurationSheet
        owner={owner}
        providerId={providerId}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        logo={LogoComponent}
      />
    </>
  );
}
