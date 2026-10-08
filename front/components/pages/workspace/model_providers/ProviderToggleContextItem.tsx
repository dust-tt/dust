import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { Icon, SettingsList, SliderToggle } from "@dust-tt/sparkle";

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
    <SettingsList.Row
      icon={<Icon visual={LogoComponent} size="lg" />}
      title={getModelMakerDisplayName(providerId)}
      description={<div className="truncate text-xs">{description}</div>}
      action={
        <SliderToggle
          selected={providersSelection[providerId]}
          onClick={handleToggleChange}
          disabled={disabled}
        />
      }
    />
  );
}
