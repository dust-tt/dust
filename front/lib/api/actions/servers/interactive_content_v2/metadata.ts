import {
  INTERACTIVE_CONTENT_SERVER_NAME,
  INTERACTIVE_CONTENT_TOOLS_METADATA,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import assert from "assert";

const publishToolMetadata = INTERACTIVE_CONTENT_TOOLS_METADATA.find(
  (
    tool
  ): tool is Extract<
    (typeof INTERACTIVE_CONTENT_TOOLS_METADATA)[number],
    { name: typeof PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME }
  > => tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
);
assert(publishToolMetadata, "Legacy Frame publish metadata expected");

export const INTERACTIVE_CONTENT_V2_SERVER_NAME =
  INTERACTIVE_CONTENT_SERVER_NAME;

export const INTERACTIVE_CONTENT_V2_PUBLISH_TOOL_METADATA = [
  {
    ...publishToolMetadata,
    description:
      "Publish a Frame from its current source. For a Frames v2 manifest, validate and snapshot " +
      "the complete source folder, build every declared function, and atomically activate the new " +
      "publication. For a legacy Frame, keep the existing single-entry-file publish behavior. " +
      "Pass the Frame's `file_id` and its current scoped source path. For Frames v2, `path` must be " +
      "the canonical `manifest.json` path. Fix any reported manifest, path, or build error and retry.",
    schema: {
      file_id: publishToolMetadata.schema.file_id.describe(
        "The ID of the canonical Frame to publish (e.g. 'fil_abc123')."
      ),
      path: publishToolMetadata.schema.path.describe(
        "Current scoped source path: the canonical `manifest.json` path for Frames v2, or the " +
          "entry source file for a legacy Frame."
      ),
    },
  },
] as const;
