import { GlobeAltIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  isBrowseResultResourceType,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { validateUrl } from "@app/types/shared/utils/url_utils";

export function MCPBrowseActionDetails({
  toolOutput,
  toolParams,
  viewType,
  owner,
}: ToolExecutionDetailsProps) {
  const urls = toolParams.urls as string[];
  const browseResults =
    toolOutput?.filter(isBrowseResultResourceType).map((o) => o.resource) ?? [];
  const generatedFiles =
    toolOutput?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Browsing the web" : "Web navigation"
      }
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {(viewType === "conversation" || browseResults.length === 0) && urls
              ? urls.map((url, idx) => (
                  <div
                    className="flex max-h-60 flex-col overflow-y-auto overflow-x-hidden pb-1"
                    key={idx}
                  >
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {url}
                    </span>
                  </div>
                ))
              : browseResults.map((r, idx) => (
                  <div
                    className="flex max-h-60 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-4"
                    key={idx}
                  >
                    {r.responseCode === "200" ? (
                      <>
                        {(() => {
                          const urlValidation = validateUrl(r.uri);
                          return urlValidation.valid ? (
                            <Link
                              href={urlValidation.standardized}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {r.title ?? r.requestedUrl}
                            </Link>
                          ) : (
                            <span className="text-sm text-foreground dark:text-foreground-night">
                              {r.title ?? r.requestedUrl} (invalid URL)
                            </span>
                          );
                        })()}
                        {r.text && (
                          <span className="whitespace-pre-wrap text-sm text-foreground dark:text-foreground-night">
                            {r.description ?? r.text.slice(0, 2048)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-foreground dark:text-foreground-night">
                        Cannot fetch content for {r.uri}, error code:{" "}
                        {r.responseCode}. {r.errorMessage}
                      </span>
                    )}
                  </div>
                ))}
          </div>
        </div>

        {generatedFiles.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Files
            </span>
            {generatedFiles.map((file) => (
              <ToolGeneratedFileDetails
                key={file.fileId}
                resource={file}
                icon={GlobeAltIcon}
                owner={owner}
              />
            ))}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
