import { Chip, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

/** Marks the rich Markdown editor as the Co-edition work in progress, enabled on Dust only. */
export function CoEditionBadge() {
  const { t } = useLingui();
  return (
    <Tooltip
      tooltipTriggerAsChild
      label={t`This editor for Markdown files is work in progress from the Co-edition initiative. It is only enabled on the Dust workspace while we build it.`}
      trigger={
        <span>
          <Chip
            size="mini"
            color="info"
            label={t`Co-edition · WIP · Dust only`}
          />
        </span>
      }
    />
  );
}
