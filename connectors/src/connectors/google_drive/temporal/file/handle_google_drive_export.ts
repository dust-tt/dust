import { MIME_TYPES_TO_EXPORT } from "@connectors/connectors/google_drive/temporal/mime_types";
import { getDriveClient } from "@connectors/connectors/google_drive/temporal/utils";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type { GoogleDriveObjectType } from "@connectors/types";
import { Context } from "@temporalio/activity";
import type { OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";

export type GoogleDriveExportResult = {
  content: CoreAPIDataSourceDocumentSection | null;
  skipReason?: string;
};

export async function handleGoogleDriveExport(
  oauth2client: OAuth2Client,
  file: GoogleDriveObjectType,
  localLogger: Logger
): Promise<GoogleDriveExportResult> {
  const drive = await getDriveClient(oauth2client);

  // We do 3 local retries for 500 Internal Server Error.
  // If we still get 500 Internal Server Error after 3 retries and the activity already
  // has been retried 20 times, we mark the file as skipped.
  let internalErrorsCount = 0;
  const maxInternalErrors = 3;

  for (;;) {
    try {
      const res = await drive.files.export({
        fileId: file.id,
        mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
      });
      if (res.status !== 200) {
        localLogger.error({}, "Error exporting Google document");
        throw new Error(
          `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
        );
      }

      if (typeof res.data === "string") {
        return {
          content:
            res.data.trim().length > 0
              ? {
                  prefix: null,
                  content: res.data.trim(),
                  sections: [],
                }
              : null,
        };
      } else if (
        ["object", "number", "boolean", "bigint"].includes(typeof res.data)
      ) {
        // In case the contents returned by the file export matches a JS type,
        // we need to convert it
        // Example: a Google presentation with just the number
        // 1 in it, the export will return the number 1 instead of a string
        return {
          content:
            res.data && res.data.toString().trim().length > 0
              ? {
                  prefix: null,
                  content: res.data.toString().trim(),
                  sections: [],
                }
              : null,
        };
      } else {
        localLogger.error(
          {
            resDataTypeOf: typeof res.data,
            type: "export",
          },
          "Unexpected GDrive export response type"
        );
        return { content: null };
      }
    } catch (e) {
      if (e instanceof GaxiosError) {
        if (e.response?.status === 404) {
          localLogger.info(
            {
              error: e,
            },
            "Can't export Gdrive document. 404 error returned, even though we know the file exists. Skipping."
          );
          return { content: null };
        }

        if (e.response?.status === 403) {
          const skippableReasons = ["exportRestricted"];

          const parsedBody =
            typeof e.response.data === "string"
              ? JSON.parse(e.response.data)
              : e.response.data;

          const errors: { reason: string }[] | undefined =
            parsedBody.error?.errors;
          const firstSkippableReason = errors?.find((error) =>
            skippableReasons.includes(error.reason)
          )?.reason;
          if (firstSkippableReason) {
            localLogger.info(
              { error: parsedBody.error },
              `Can't export Gdrive document. Skippable reason: ${firstSkippableReason}. Skipping.`
            );
            return { content: null };
          }
        }

        // Check if the error message indicates the file is too large to export
        if (
          e.message &&
          e.message.includes("This file is too large to be exported")
        ) {
          localLogger.info(
            { error: e.message },
            "File is too large to be exported. Skipping."
          );
          return { content: null };
        }

        // If Google consistently returns 500 Internal Server Error after many
        // retries, skip the file to avoid infinite retries.
        if (e.response?.status === 500) {
          internalErrorsCount++;
          if (internalErrorsCount > maxInternalErrors) {
            if (Context.current().info.attempt > 20) {
              localLogger.info(
                {
                  fileId: file.id,
                  attempt: Context.current().info.attempt,
                },
                "Consistently getting 500 Internal Server Error from Google Drive export, skipping."
              );
              return {
                content: null,
                skipReason: "google_internal_server_error",
              };
            }
          } else {
            // Allow locally retrying the API call.
            continue;
          }
        }
      }

      localLogger.error({ error: e }, "Error exporting Google document");
      throw e;
    }
  }
}
