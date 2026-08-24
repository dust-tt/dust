import type { AutomationsFilterOption } from "@app/components/workspace/analytics/automationsFilter";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Avatar } from "@dust-tt/sparkle";

interface AutomationsFilterOptionIconProps {
  option: AutomationsFilterOption;
}

export function AutomationsFilterOptionIcon({
  option,
}: AutomationsFilterOptionIconProps) {
  switch (option.category) {
    case "agent":
      return (
        <Avatar
          name={option.name}
          visual={option.image ?? undefined}
          size="xxs"
        />
      );
    case "member":
      return (
        <Avatar
          name={option.name}
          visual={option.image ?? undefined}
          size="xxs"
          isRounded
        />
      );
    case "type":
    case "pool":
      return null;
    default:
      assertNeverAndIgnore(option.category);
      return null;
  }
}
