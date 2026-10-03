import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem, Icon, SliderToggle } from "@dust-tt/sparkle";

interface ProviderToggleContextItemProps {
  providerId: WhitelistableModelMakerIdType;
  description: string;
  providersSelection: ProvidersSelection;
  handleToggleChange: () => void;
  disabled: boolean;
}
export function ProviderToggleContextItem({
  providerId,
  description,
  providersSelection,
  handleToggleChange,
  disabled,
}: ProviderToggleContextItemProps) {
  const { isDark } = useTheme();
  const LogoComponent = getModelMakerLogo(providerId, isDark);

  return (
    <ContextItem
      key={providerId}
      title={getModelMakerDisplayName(providerId)}
      visual={<Icon visual={LogoComponent} size="lg" />}
      action={
        <SliderToggle
          selected={providersSelection[providerId]}
          onClick={handleToggleChange}
          disabled={disabled}
        />
      }
    >
      <ContextItem.Description>
        <span className="text-sm text-muted-foreground">{description}</span>
      </ContextItem.Description>
    </ContextItem>
  );
}
