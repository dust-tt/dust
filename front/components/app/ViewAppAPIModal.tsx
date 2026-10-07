import "@uiw/react-textarea-code-editor/dist.css";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { SuspensedCodeEditor } from "@app/components/SuspensedCodeEditor";
import config from "@app/lib/api/config";
import type { AppType } from "@app/types/app";
import type { RunConfig, RunType } from "@app/types/run";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Clipboard,
  Cube01,
  Hoverable,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

const cleanUpConfig = (config: RunConfig) => {
  if (!config) {
    return "{}";
  }
  const c = {} as { [key: string]: any };
  for (const key in config.blocks) {
    if (config.blocks[key].type !== "input") {
      c[key] = config.blocks[key];
      delete c[key].type;
    }
  }
  return JSON.stringify(c);
};

const DEFAULT_INPUTS = [{ hello: "world" }];

interface ViewAppAPIModalProps {
  owner: WorkspaceType;
  app: AppType;
  run: RunType;
  inputs?: unknown[];
  disabled: boolean;
}

export function ViewAppAPIModal({
  owner,
  app,
  run,
  inputs = DEFAULT_INPUTS,
  disabled,
}: ViewAppAPIModalProps) {
  const { t } = useLingui();
  const cURLRequest = (type: "run") => {
    switch (type) {
      case "run":
        return `curl ${config.getApiBaseUrl()}/api/v1/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs \\
    -H "Authorization: Bearer YOUR_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{
      "specification_hash": "${run?.app_hash}",
      "config": ${cleanUpConfig(run?.config)},
      "blocking": true,
      "inputs": ${JSON.stringify(inputs)}
    }'`;
      default:
        assertNever(type);
    }
  };

  const [isRunCopied, setIsRunCopied] = useState(false);

  // Copy the cURL request to the clipboard
  const handleCopyClick = async (type: "run") => {
    await navigator.clipboard.writeText(cURLRequest(type));

    switch (type) {
      case "run":
        setIsRunCopied(true);
        setTimeout(() => {
          setIsRunCopied(false);
        }, 1500);
        break;
      default:
        assertNever(type);
    }
  };

  const { isDark } = useTheme();
  const appName = app.name;

  return (
    <Sheet>
      <SheetTrigger>
        <Button
          icon={Cube01}
          tooltip={
            disabled
              ? t`You need to run this app at least once successfully to view the endpoint`
              : t`View how to run this app programmatically`
          }
          label={t`Use with API`}
          variant="primary"
          disabled={disabled}
        />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <Trans>Apps API</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="w-full">
            <Page.Vertical sizing="grow">
              <Page.P>
                <ul className="text-muted-foreground">
                  <li>
                    spaceId:{" "}
                    <span className="font-bold">{app.space.sId}</span>{" "}
                  </li>
                  <li>
                    appId: <span className="font-bold">{app.sId}</span>
                  </li>
                </ul>
              </Page.P>

              <Page.Separator />

              <Page.SectionHeader title={t`Run app`} />
              <Page.P>
                <Trans>
                  Use the following cURL command to run the app{" "}
                  <span className="italic">{appName}</span>:
                </Trans>
              </Page.P>
              <SuspensedCodeEditor
                data-color-mode={isDark ? "dark" : "light"}
                readOnly={true}
                value={`$ ${cURLRequest("run")}`}
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

              <div className="flex w-full flex-row items-end">
                <div className="flex-grow"></div>
                <div className="flex">
                  <Button
                    variant="outline"
                    onClick={() => handleCopyClick("run")}
                    label={isRunCopied ? t`Copied!` : t`Copy`}
                    icon={Clipboard}
                  />
                </div>
              </div>

              <Page.Separator />

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

              <Page.Separator />

              <Page.SectionHeader title={t`Documentation`} />
              <Page.P>
                <Trans>
                  For a detailed documentation of the Data source API, please
                  refer to the{" "}
                  <Hoverable
                    href={
                      "https://docs.dust.tt/reference/post_api-v1-w-wid-vaults-vid-apps-aid-runs"
                    }
                    variant="highlight"
                  >
                    API reference
                  </Hoverable>
                </Trans>
              </Page.P>
            </Page.Vertical>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
