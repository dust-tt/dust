import { ResourceAvatar } from "@app/components/resources/resources_icons";
import type React from "react";

export function getSlashCommandAvatarIcon(icon: React.ComponentType) {
  return () => <ResourceAvatar icon={icon} size="sm" />;
}
