import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types/shared/utils/time_frame";

export function getDataSourceSearchTimestampGtMs({
  documentTimeFrame,
  relativeTimeFrame,
  isDocumentTimeFrameEnabled,
}: {
  documentTimeFrame?: string;
  relativeTimeFrame?: string;
  isDocumentTimeFrameEnabled: boolean;
}): Result<number | null, MCPError> {
  if (documentTimeFrame !== undefined && !isDocumentTimeFrameEnabled) {
    return new Err(
      new MCPError(
        "The `documentTimeFrame` parameter is not enabled for this workspace.",
        {
          tracked: false,
        }
      )
    );
  }

  if (documentTimeFrame !== undefined) {
    const timeFrame = parseTimeFrame(documentTimeFrame);
    if (!timeFrame) {
      return new Err(
        new MCPError(
          "Invalid `documentTimeFrame` value. Use a duration like `7d`, `4w`, or `6m`.",
          {
            tracked: false,
          }
        )
      );
    }

    return new Ok(timeFrameFromNow(timeFrame));
  }

  const timeFrame = parseTimeFrame(relativeTimeFrame ?? "all");
  return new Ok(timeFrame ? timeFrameFromNow(timeFrame) : null);
}
