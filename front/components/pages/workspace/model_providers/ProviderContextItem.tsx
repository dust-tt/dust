import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  PRETTIFIED_PROVIDER_NAMES,
  type ProvidersSelection,
} from "@app/types/provider_selection";
import { ContextItem, Icon, SliderToggle } from "@dust-tt/sparkle";

type ProviderContextItemProps = {
  providerId: ModelProviderIdType;
  description: string;
  providersSelection: ProvidersSelection;
  handleToggleChange: () => void;
  disabled: boolean;
};
export function ProviderContextItem({
  providerId,
  description,
  providersSelection,
  handleToggleChange,
  disabled,
}: ProviderContextItemProps) {
  const { isDark } = useTheme();
  const LogoComponent = getModelProviderLogo(providerId, isDark);

  return (
    <ContextItem
      key={providerId}
      title={PRETTIFIED_PROVIDER_NAMES[providerId]}
      visual={<Icon visual={LogoComponent} size="lg" />}
      action={
        <SliderToggle
          size="xs"
          selected={providersSelection[providerId]}
          onClick={handleToggleChange}
          disabled={disabled}
        />
      }
    >
      <ContextItem.Description>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </span>
      </ContextItem.Description>
    </ContextItem>
  );
}
