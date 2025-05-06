import {
  Button,
  CollapsibleComponent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Label,
  XMarkIcon,
} from "@dust-tt/sparkle";

import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types";
import {
  WebcrawlerCustomCrawler,
  WebCrawlerHeaderRedactedValue,
} from "@app/types";

type Header = { key: string; value: string };

type AdvancedSettingsProps = {
  headers: Header[];
  crawler: WebcrawlerCustomCrawler | null;
  onHeadersChange: (headers: Header[]) => void;
  onCrawlerChange: (crawler: WebcrawlerCustomCrawler | null) => void;
  owner: LightWorkspaceType;
};

export function AdvancedSettingsSection({
  headers,
  crawler,
  onHeadersChange,
  onCrawlerChange,
  owner,
}: AdvancedSettingsProps) {
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const updateHeaderField = (
    index: number,
    field: keyof Header,
    value: string
  ) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    onHeadersChange(newHeaders);
  };

  const removeHeader = (index: number) => {
    onHeadersChange(headers.filter((_, i) => i !== index));
  };

  const addHeader = () => {
    onHeadersChange([...headers, { key: "", value: "" }]);
  };

  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen: false }}
      triggerProps={{ label: "Advanced settings", variant: "secondary" }}
      contentChildren={
        <div className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-3">
            <Label>Custom Headers</Label>
            <p>Add custom request headers for the web crawler.</p>
            <div className="flex flex-col gap-4">
              {headers.map((header, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex grow flex-col gap-1 px-1">
                    <Input
                      placeholder="Header Name"
                      value={header.key}
                      name="headerName"
                      onChange={(e) =>
                        updateHeaderField(index, "key", e.target.value)
                      }
                      disabled={header.value === WebCrawlerHeaderRedactedValue}
                      className="grow"
                    />
                    <Input
                      name="headerValue"
                      placeholder="Header Value"
                      value={header.value}
                      onChange={(e) =>
                        updateHeaderField(index, "value", e.target.value)
                      }
                      disabled={header.value === WebCrawlerHeaderRedactedValue}
                      className="flex-1"
                    />
                  </div>
                  <Button
                    variant="outline"
                    icon={XMarkIcon}
                    onClick={() => removeHeader(index)}
                  />
                </div>
              ))}
            </div>
            <Button variant="outline" label="Add Header" onClick={addHeader} />
          </div>

          {hasFeature("custom_webcrawler") && (
            <div className="flex w-full flex-col gap-3">
              <div>
                <Label>Custom crawler</Label>
                <p>Select a custom crawler to use</p>
              </div>

              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      label={crawler ?? "default"}
                      variant="outline"
                      size="sm"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={crawler ?? "default"}
                      onValueChange={(value) => {
                        if (value === "default") {
                          onCrawlerChange(null);
                        } else {
                          onCrawlerChange(
                            Object.values(WebcrawlerCustomCrawler).find(
                              (v) => v === value
                            ) ?? null
                          );
                        }
                      }}
                    >
                      <DropdownMenuRadioItem value="default">
                        default
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="firecrawl">
                        firecrawl
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
