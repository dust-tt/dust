import { WebCrawlerHeaderRedactedValue } from "@app/types/connectors/webcrawler";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

type Header = { key: string; value: string };

type AdvancedSettingsProps = {
  headers: Header[];
  onHeadersChange: (headers: Header[]) => void;
  owner: LightWorkspaceType;
};

export function AdvancedSettingsSection({
  headers,
  onHeadersChange,
}: AdvancedSettingsProps) {
  const { t } = useLingui();

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
    <Collapsible>
      <CollapsibleTrigger label={t`Advanced settings`} variant="secondary" />
      <CollapsibleContent>
        <div className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-3">
            <Label>
              <Trans>Custom headers</Trans>
            </Label>
            <p>
              <Trans>Add custom request headers for the web crawler.</Trans>
            </p>
            <div className="flex flex-col gap-4">
              {headers.map((header, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex grow flex-col gap-1 px-1">
                    <Input
                      placeholder={t`Header name`}
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
                      placeholder={t`Header value`}
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
                    icon={XClose}
                    onClick={() => removeHeader(index)}
                  />
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              label={t`Add header`}
              onClick={addHeader}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
