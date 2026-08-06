import type { GroupKind } from "@app/types/groups";
import type { Chip } from "@dust-tt/sparkle";
import type React from "react";

export type GroupChipColor = NonNullable<
  React.ComponentProps<typeof Chip>["color"]
>;

/**
 * Chip label and color for a group kind. Single source of truth so provisioned groups read the same
 * (green) and manually-managed ones the same (golden) everywhere they are surfaced.
 */
export function getGroupKindChip(kind: GroupKind): {
  label: string;
  color: GroupChipColor;
} {
  switch (kind) {
    case "provisioned":
      return { label: "Provisioned", color: "success" };
    default:
      return { label: "Manual", color: "info" };
  }
}

export const PROVISIONED_GROUP_TOOLTIP =
  "Synced from your identity provider. Manage membership in your IdP.";
