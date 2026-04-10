import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { ToolGeneratedFileDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import type { BrowseResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isBrowseResultResourceType,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isWebbrowseInputType } from "@app/lib/actions/mcp_internal_actions/types";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import { Card, FaviconIcon, GlobeAltIcon } from "@dust-tt/sparkle";

interface BrowseResultItemProps {
  result: BrowseResultResourceType;
}

function BrowseResultItem({ result }: BrowseResultItemProps) {
  const isSuccess = result.responseCode === "200";
  const urlValidation = validateUrl(result.uri);
  const title = result.title ?? result.requestedUrl;
  const subtitle = isSuccess
    ? result.description
    : `Error ${result.responseCode}${result.errorMessage ? `: ${result.errorMessage}` : ""}`;

  const linkProps = urlValidation.valid
    ? { href: urlValidation.standardized, target: "_blank" as const }
    : {};

  return (
    <Card variant={isSuccess ? "primary" : "warning"} size="sm" {...linkProps}>
      <div className="flex items-start gap-2">
        <FaviconIcon websiteUrl={result.uri} size="md" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{title}</span>
          {subtitle && (
            // Only show at most 2 lines, with an ellipsis if too big.
            <p className="line-clamp-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function MCPBrowseActionDetails({
  toolOutput,
  toolParams,
  displayContext,
  owner,
}: ToolExecutionDetailsProps) {
  const urls = isWebbrowseInputType(toolParams) ? toolParams.urls : null;

  const browseResults =
    toolOutput?.filter(isBrowseResultResourceType).map((o) => o.resource) ?? [];
  const generatedFiles =
    toolOutput?.filter(isToolGeneratedFile).map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? "Browsing the web"
          : "Web navigation"
      }
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {(displayContext === "conversation" ||
              browseResults.length === 0) &&
            urls
              ? urls.map((url, idx) => (
                  <div
                    className="group flex max-h-60 flex-row items-center gap-x-1 overflow-y-auto overflow-x-hidden pb-1"
                    key={idx}
                  >
                    <span className="grayscale transition-all duration-150 ease-in-out group-hover:grayscale-0">
                      <FaviconIcon websiteUrl={url} />
                    </span>
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
                            <LinkWrapper
                              href={urlValidation.standardized}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {r.title ?? r.requestedUrl}
                            </LinkWrapper>
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
                owner={owner}
              />
            ))}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
