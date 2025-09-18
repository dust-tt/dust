import {
  Button,
  Input,
  XMarkIcon,
} from "@dust-tt/sparkle";

import { WebCrawlerHeaderRedactedValue } from "@app/types";

type Header = { key: string; value: string };

type McpServerHeadersProps = {
  headers: Header[];
  onHeadersChange: (headers: Header[]) => void;
};

export function McpServerHeaders({
  headers,
  onHeadersChange,
}: McpServerHeadersProps) {
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
        <div className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-3">
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
        </div>
  );
}
