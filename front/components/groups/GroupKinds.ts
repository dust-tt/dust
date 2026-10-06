import type { GroupKind } from "@app/types/groups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { Chip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type React from "react";
import { useCallback } from "react";

export type GroupChipColor = NonNullable<
  React.ComponentProps<typeof Chip>["color"]
>;

/**
 * Chip label and color for a group kind. Single source of truth so provisioned groups read the same
 * (green) and manually-managed ones the same (golden) everywhere they are surfaced.
 */
export function getGroupKindChip(kind: GroupKind): {
  label: MessageDescriptor;
  color: GroupChipColor;
} {
  switch (kind) {
    case "provisioned":
      return { label: msg`Provisioned`, color: "success" };
    case "regular_manual":
      return { label: msg`Manual`, color: "info" };
    // Only provisioned and manual groups are surfaced to users, so this should never be displayed.
    case "global":
    case "regular_auto":
    case "system":
      return { label: msg`Other`, color: "primary" };
    default:
      assertNeverAndIgnore(kind);
      return { label: msg`Other`, color: "primary" };
  }
}

export function useGroupKindChip(): (kind: GroupKind) => {
  label: string;
  color: GroupChipColor;
} {
  const { t } = useLingui();
  return useCallback(
    (kind: GroupKind) => {
      const { label, color } = getGroupKindChip(kind);
      return { label: t(label), color };
    },
    [t]
  );
}

export const PROVISIONED_GROUP_TOOLTIP = msg`Synced from your identity provider. Manage membership in your IdP.`;

export function useProvisionedGroupTooltip(): string {
  const { t } = useLingui();
  return t(PROVISIONED_GROUP_TOOLTIP);
}
