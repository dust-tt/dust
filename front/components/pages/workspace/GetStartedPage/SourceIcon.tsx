import { useTheme } from "@app/components/sparkle/ThemeContext";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { isConnectorProvider } from "@app/types/data_source";
import { ActionBrainIcon, Folder, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// Sparkle icons the recommendation source can reference by name (when the
// source is not a data-source connector). Falls back to a folder.
const SPARKLE_ICON_BY_NAME: Record<string, ComponentType> = {
  ActionBrainIcon,
  Folder,
};

interface SourceIconProps {
  sourceIcon: string;
}

export function SourceIcon({ sourceIcon }: SourceIconProps) {
  const { isDark } = useTheme();

  if (isConnectorProvider(sourceIcon)) {
    const Logo =
      CONNECTOR_UI_CONFIGURATIONS[sourceIcon].getLogoComponent(isDark);
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
        <Logo />
      </span>
    );
  }
  const SparkleIcon = SPARKLE_ICON_BY_NAME[sourceIcon] ?? Folder;
  return (
    <Icon visual={SparkleIcon} size="sm" className="shrink-0 text-faint" />
  );
}
