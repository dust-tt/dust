import type { CollabSwitch } from "@app/components/file_explorer/useMarkdownFileEditor";
import { Chip, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface CollabBadgeProps {
  collab: CollabSwitch;
}

/**
 * Marks the rich Markdown editor as the collab unstable alpha, enabled on Dust only, and
 * switches the file back to the regular preview and editor.
 */
export function CollabBadge({ collab }: CollabBadgeProps) {
  const { t } = useLingui();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Tooltip
        tooltipTriggerAsChild
        label={
          collab.canSwitch
            ? collab.isOn
              ? t`Switch back to the regular preview and editor.`
              : t`Open Markdown files in the Co-edition editor.`
            : t`Save your changes before switching editors.`
        }
        trigger={
          <span className="flex shrink-0">
            <SliderToggle
              selected={collab.isOn}
              disabled={!collab.canSwitch}
              onClick={() => collab.setIsOn(!collab.isOn)}
            />
          </span>
        }
      />
      <Tooltip
        tooltipTriggerAsChild
        label={t`This editor for Markdown files is an unstable alpha from the Co-edition initiative. It is only enabled on the Dust workspace while we build it.`}
        trigger={
          <span className="shrink-0">
            <Chip
              size="mini"
              color={collab.isOn ? "info" : "primary"}
              label={t`Co-edition · Unstable alpha`}
            />
          </span>
        }
      />
    </div>
  );
}
