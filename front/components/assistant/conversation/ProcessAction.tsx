import { Chip, Spinner, Tooltip } from "@dust-tt/sparkle";
import type { ProcessActionType } from "@dust-tt/types";

export default function ProcessAction({
  processAction,
}: {
  processAction: ProcessActionType;
}) {
  const { relativeTimeFrame } = processAction.params;

  function shortText(text: string, maxLength = 20) {
    const t = text.replaceAll("\n", " ");
    return t.length > maxLength ? t.substring(0, maxLength) + "..." : t;
  }

  return (
    <>
      {processAction.params && Object.keys(processAction.params).length > 0 && (
        <div className="flex flex-row items-center gap-2 pb-2">
          <div className="flex flex-col items-start text-xs font-bold text-element-600">
            <div className="flex">Timeframe:</div>
          </div>
          {relativeTimeFrame && (
            <Tooltip label="Docs created or updated during that time are included in the search">
              <Chip
                color="amber"
                label={
                  relativeTimeFrame
                    ? "During the last " +
                      (relativeTimeFrame.duration > 1
                        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
                        : `${relativeTimeFrame.unit}`)
                    : "All time"
                }
              />
            </Tooltip>
          )}
        </div>
      )}

      {!processAction.outputs ? (
        <div>
          <div className="pb-2 text-xs font-bold text-element-600">
            Retrieving...
          </div>
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-row items-center gap-2 pb-2">
          <div className="flex flex-col items-start text-xs font-bold text-element-600">
            <div className="flex">Outputs params:</div>
          </div>
          <Chip.List isWrapping={true}>
            {Object.keys(processAction.outputs).map((k) => (
              <Tooltip
                key={k}
                label={`${k}: ${JSON.stringify(processAction.outputs[k])}`}
              >
                <Chip
                  color="slate"
                  label={shortText(
                    `${k}: ${JSON.stringify(processAction.outputs[k])}`
                  )}
                />
              </Tooltip>
            ))}
          </Chip.List>
        </div>
      )}
    </>
  );
}
