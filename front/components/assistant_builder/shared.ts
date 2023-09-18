import { ConnectorProvider } from "@app/lib/connectors_api";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";

export const TIME_FRAME_MODES = ["AUTO", "FORCED"] as const;
export type TimeFrameMode = (typeof TIME_FRAME_MODES)[number];
export const TIME_FRAME_MODE_TO_LABEL: Record<TimeFrameMode, string> = {
  AUTO: "Auto (default)",
  FORCED: "Forced",
};
export const TIME_FRAME_UNIT_TO_LABEL: Record<TimeframeUnit, string> = {
  hour: "hours",
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

export const CONNECTOR_PROVIDER_TO_RESOURCE_NAME: Record<
  ConnectorProvider,
  {
    singular: string;
    plural: string;
  }
> = {
  notion: { singular: "page", plural: "pages" },
  google_drive: { singular: "folder", plural: "folders" },
  slack: { singular: "channel", plural: "channels" },
  github: { singular: "repository", plural: "repositories" },
};
