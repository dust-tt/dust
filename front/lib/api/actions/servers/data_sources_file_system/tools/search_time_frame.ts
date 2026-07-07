import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types/shared/utils/time_frame";

export function getDataSourceSearchTimestampGtMs({
  maxAgeSeconds,
  relativeTimeFrame,
  isMaxAgeEnabled,
}: {
  maxAgeSeconds?: number;
  relativeTimeFrame?: string;
  isMaxAgeEnabled: boolean;
}): Result<number | null, MCPError> {
  if (maxAgeSeconds !== undefined && !isMaxAgeEnabled) {
    return new Err(
      new MCPError(
        "The `maxAgeSeconds` parameter is not enabled for this workspace.",
        {
          tracked: false,
        }
      )
    );
  }

  if (maxAgeSeconds !== undefined) {
    if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
      return new Err(
        new MCPError(
          "Invalid `maxAgeSeconds` value. Use a positive integer number of seconds.",
          {
            tracked: false,
          }
        )
      );
    }

    return new Ok(Math.round(Date.now() - maxAgeSeconds * 1000));
  }

  const timeFrame = parseTimeFrame(relativeTimeFrame ?? "all");
  return new Ok(timeFrame ? timeFrameFromNow(timeFrame) : null);
}
