import type { CoEditionSwitch } from "@app/components/file_explorer/useMarkdownFileEditor";
import { Chip, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface CoEditionBadgeProps {
  coEdition: CoEditionSwitch;
}

/**
 * Marks the rich Markdown editor as the Co-edition unstable alpha, enabled on Dust only, and
 * switches the file back to the regular preview and editor.
 */
export function CoEditionBadge({ coEdition }: CoEditionBadgeProps) {
  const { t } = useLingui();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Tooltip
        tooltipTriggerAsChild
        label={
          coEdition.canSwitch
            ? coEdition.isOn
              ? t`Switch back to the regular preview and editor.`
              : t`Open Markdown files in the Co-edition editor.`
            : t`Save your changes before switching editors.`
        }
        trigger={
          <span className="flex shrink-0">
            <SliderToggle
              selected={coEdition.isOn}
              disabled={!coEdition.canSwitch}
              onClick={() => coEdition.setIsOn(!coEdition.isOn)}
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
              color={coEdition.isOn ? "info" : "primary"}
              label={t`Co-edition · Unstable alpha`}
            />
          </span>
        }
      />
    </div>
  );
}
