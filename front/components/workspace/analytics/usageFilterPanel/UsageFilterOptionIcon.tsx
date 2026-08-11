import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { UsageFilterOption } from "@app/components/workspace/analytics/usageFilter";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Avatar, Icon } from "@dust-tt/sparkle";

interface UsageFilterOptionIconProps {
  option: UsageFilterOption;
}

export function UsageFilterOptionIcon({ option }: UsageFilterOptionIconProps) {
  const { isDark } = useTheme();

  switch (option.kind) {
    case "member":
    case "agent":
      return (
        <Avatar
          name={option.name}
          visual={option.image ?? undefined}
          size="xxs"
          isRounded
        />
      );
    case "source": {
      const logo = getConnectorProviderLogoWithFallback({
        provider: option.connectorProvider ?? null,
        isDark,
      });
      return <Icon visual={logo} size="sm" />;
    }
    case "model":
      return <Icon visual={getModelMakerLogo(option.lab, isDark)} size="sm" />;
    case "team":
    case "tool":
    case "skill":
      return null;
    default:
      assertNeverAndIgnore(option);
      return null;
  }
}
