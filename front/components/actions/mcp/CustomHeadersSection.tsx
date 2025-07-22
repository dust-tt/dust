import { Button, Input } from "@dust-tt/sparkle";

import {
  addNewHeader,
  getDisplayHeaderKey,
  isValidHeaderKey,
  removeHeader,
  updateHeaderKey,
  updateHeaderValue,
} from "@app/lib/actions/mcp_remote_actions/remote_mcp_custom_headers";

interface CustomHeadersSectionProps {
  customHeaders: Record<string, string>;
  customHeadersErrors: string[];
  onCustomHeadersChange: (headers: Record<string, string>) => void;
}

export function CustomHeadersSection({
  customHeaders,
  customHeadersErrors,
  onCustomHeadersChange,
}: CustomHeadersSectionProps) {
  return (
    <div className="space-y-3">
      {customHeadersErrors.length > 0 && (
        <div className="space-y-1 text-sm text-red-600">
          {customHeadersErrors.map((error, index) => (
            <div key={index}>• {error}</div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {Object.entries(customHeaders).map(([key, value], index) => {
          const totalHeaders = Object.keys(customHeaders).length;
          const isOnlyHeader = totalHeaders === 1;
          const isEmpty = !key.trim() && !value.trim();

          return (
            <div key={`header-${index}`} className="flex space-x-2">
              <Input
                placeholder="Header name"
                value={getDisplayHeaderKey(key)}
                onChange={(e) => {
                  const newKey = e.target.value;
                  onCustomHeadersChange(
                    updateHeaderKey(customHeaders, key, newKey)
                  );
                }}
                isError={!isValidHeaderKey(getDisplayHeaderKey(key))}
              />
              <Input
                placeholder="Header value"
                value={value}
                onChange={(e) => {
                  onCustomHeadersChange(
                    updateHeaderValue(customHeaders, key, e.target.value)
                  );
                }}
                isError={!value.trim() && key.trim() !== ""}
              />
              {isOnlyHeader && isEmpty ? (
                <Button
                  variant="outline"
                  size="sm"
                  label="Remove"
                  disabled
                  className="opacity-50"
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  label="Remove"
                  onClick={() => {
                    onCustomHeadersChange(removeHeader(customHeaders, key));
                  }}
                />
              )}
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          label="Add Header"
          onClick={() => {
            onCustomHeadersChange(addNewHeader(customHeaders));
          }}
        />
      </div>
    </div>
  );
}
