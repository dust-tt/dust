import "@uiw/react-textarea-code-editor/dist.css";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import config from "@app/lib/api/config";
import type { DataSourceType } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Clipboard,
  Hoverable,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface ViewFolderAPIModalProps {
  dataSource: DataSourceType;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  space: SpaceType;
}

export function ViewFolderAPIModal({
  dataSource,
  isOpen,
  onClose,
  owner,
  space,
}: ViewFolderAPIModalProps) {
  const { t } = useLingui();
  const cURLRequest = (type: "upsert" | "search") => {
    switch (type) {
      case "upsert":
        return `curl "${config.getApiBaseUrl()}/api/v1/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/documents/YOUR_DOCUMENT_ID" \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "text": "Lorem ipsum dolor sit amet...",
      "source_url": "https://acme.com"
    }'`;
      case "search":
        return `curl "${config.getApiBaseUrl()}/api/v1/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/search?query=foo+bar&top_k=16&full_text=false" \\
    -H "Authorization: Bearer YOUR_API_KEY"`;
      default:
        assertNever(type);
    }
  };

  const [isSearchCopied, setIsSearchCopied] = useState(false);
  const [isUpsertCopied, setIsUpsertCopied] = useState(false);

  // Copy the cURL request to the clipboard
  const handleCopyClick = async (type: "upsert" | "search") => {
    await navigator.clipboard.writeText(cURLRequest(type));

    switch (type) {
      case "upsert":
        setIsUpsertCopied(true);
        setTimeout(() => {
          setIsUpsertCopied(false);
        }, 1500);
        break;
      case "search":
        setIsSearchCopied(true);
        setTimeout(() => {
          setIsSearchCopied(false);
        }, 1500);
        break;
      default:
        assertNever(type);
    }
  };

  const { isDark } = useTheme();
  const dataSourceName = dataSource.name;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <Trans>Data source API</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer className="pb-8">
          <div className="flex flex-col gap-6">
            <Page.P>
              <div className="rounded-lg bg-muted-background p-4 shadow-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      <Trans>Space ID:</Trans>
                    </span>
                    <code className="rounded bg-background px-2 py-1 font-mono text-sm font-semibold text-foreground shadow-sm">
                      {space.sId}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      <Trans>Data source ID:</Trans>
                    </span>
                    <code className="rounded bg-background px-2 py-1 font-mono text-sm font-semibold text-foreground shadow-sm">
                      {dataSource.sId}
                    </code>
                  </div>
                </div>
              </div>
            </Page.P>

            <Page.Separator />

            <div>
              <Page.SectionHeader title={t`Upsert document`} />
              <Page.P>
                <Trans>
                  Use the following cURL command to upsert a document to folder{" "}
                  <span className="italic">{dataSourceName}</span>:
                </Trans>
              </Page.P>
              <SuspensedCodeEditor
                data-color-mode={isDark ? "dark" : "light"}
                readOnly={true}
                value={`$ ${cURLRequest("upsert")}`}
                language="shell"
                padding={15}
                className="mt-5 rounded-md bg-muted-background px-4 py-4 font-mono text-[13px]"
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  width: "100%",
                  marginTop: "0rem",
                }}
              />
              <div className="mt-2 flex w-full justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleCopyClick("upsert")}
                  label={isUpsertCopied ? t`Copied!` : t`Copy`}
                  icon={Clipboard}
                />
              </div>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title={t`Search`} />
              <Page.P>
                <Trans>
                  Use the following cURL command to search in folder{" "}
                  <span className="italic">{dataSourceName}</span>:
                </Trans>
              </Page.P>
              <SuspensedCodeEditor
                data-color-mode={isDark ? "dark" : "light"}
                readOnly={true}
                value={`$ ${cURLRequest("search")}`}
                language="shell"
                padding={15}
                className="mt-5 rounded-md bg-muted-background px-4 py-4 font-mono text-[13px]"
                style={{
                  fontSize: 13,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                  width: "100%",
                  marginTop: "0rem",
                }}
              />
              <div className="mt-2 flex w-full justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleCopyClick("search")}
                  label={isSearchCopied ? t`Copied!` : t`Copy`}
                  icon={Clipboard}
                />
              </div>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title={t`API keys`} />
              <Page.P>
                <div className="pb-2">
                  {isAdmin(owner) ? (
                    <Hoverable
                      href={`/w/${owner.sId}/developers/api-keys`}
                      variant="highlight"
                    >
                      <Trans>Manage workspace API keys</Trans>
                    </Hoverable>
                  ) : (
                    <span>
                      <Trans>API keys are managed by workspace admins.</Trans>
                    </span>
                  )}
                </div>
                <span>
                  <Trans>
                    Handle API keys with care as they provide access to your
                    company data.
                  </Trans>
                </span>
              </Page.P>
            </div>

            <Page.Separator />

            <div>
              <Page.SectionHeader title={t`Documentation`} />
              <Page.P>
                <Trans>
                  For a detailed documentation of the Data source API, please
                  refer to the{" "}
                  <Hoverable
                    href={"https://docs.dust.tt/reference/"}
                    variant="highlight"
                  >
                    API reference
                  </Hoverable>
                </Trans>
              </Page.P>
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
