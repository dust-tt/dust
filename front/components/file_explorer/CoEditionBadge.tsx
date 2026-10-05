import { Chip, Tooltip } from "@dust-tt/sparkle";

/** Marks the rich Markdown editor as the Co-edition work in progress, enabled on Dust only. */
export function CoEditionBadge() {
  return (
    <Tooltip
      tooltipTriggerAsChild
      label="This editor for Markdown files is work in progress from the Co-edition initiative. It is only enabled on the Dust workspace while we build it."
      trigger={
        <span>
          <Chip size="mini" color="info" label="Co-edition · WIP · Dust only" />
        </span>
      }
    />
  );
}
