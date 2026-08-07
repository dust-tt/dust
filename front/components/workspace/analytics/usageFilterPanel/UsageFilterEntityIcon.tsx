import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type {
  UsageFilterCategory,
  UsageFilterEntity,
} from "@app/components/workspace/analytics/usageFilter";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Avatar, Icon } from "@dust-tt/sparkle";

interface UsageFilterEntityIconProps {
  category: UsageFilterCategory;
  entity: UsageFilterEntity;
}

export function UsageFilterEntityIcon({
  category,
  entity,
}: UsageFilterEntityIconProps) {
  const { isDark } = useTheme();

  switch (category) {
    case "member":
      return (
        <Avatar
          name={entity.name}
          visual={entity.image ?? undefined}
          size="xxs"
          isRounded
        />
      );
    case "source": {
      const logo = getConnectorProviderLogoWithFallback({
        provider: entity.connectorProvider ?? null,
        isDark,
      });
      return <Icon visual={logo} size="sm" />;
    }
    case "model":
      return entity.lab ? (
        <Icon visual={getModelMakerLogo(entity.lab, isDark)} size="sm" />
      ) : null;
    case "agent":
    case "tool":
    case "skill":
      return null;
    default:
      assertNeverAndIgnore(category);
      return null;
  }
}
