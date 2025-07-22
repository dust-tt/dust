import { Button, Input } from "@dust-tt/sparkle";

import {
  addNewHeader,
  getDisplayHeaderKey,
  isValidHeaderKey,
  removeHeader,
  updateHeaderKey,
  updateHeaderValue,
} from "@app/lib/actions/mcp_remote_actions/remote_mcp_custom_headers";

interface EditCustomHeadersSectionProps {
  existingHeaders: Record<string, string>;
  newHeaders: Record<string, string>;
  customHeadersErrors: string[];
  headersToRemove: string[];
  onNewHeadersChange: (headers: Record<string, string>) => void;
  onRemoveExistingHeader: (key: string) => void;
}

export function EditCustomHeadersSection({
  existingHeaders,
  newHeaders,
  customHeadersErrors,
  headersToRemove,
  onNewHeadersChange,
  onRemoveExistingHeader,
}: EditCustomHeadersSectionProps) {
  // Filter out headers marked for removal
  const visibleExistingHeaders = Object.fromEntries(
    Object.entries(existingHeaders).filter(
      ([key]) => !headersToRemove.includes(key)
    )
  );

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
        {Object.entries(visibleExistingHeaders).map(([key, value]) => (
          <div key={`existing-${key}`} className="flex space-x-2">
            <Input
              placeholder="Header name"
              value={getDisplayHeaderKey(key)}
              disabled
              className="opacity-60"
            />
            <Input
              placeholder="Header value"
              value={value}
              disabled
              className="opacity-60"
            />
            <Button
              variant="outline"
              size="sm"
              label="Remove"
              onClick={() => onRemoveExistingHeader(key)}
            />
          </div>
        ))}

        {Object.keys(newHeaders).length > 0
          ? Object.entries(newHeaders).map(([key, value], index) => {
              const totalHeaders = Object.keys(newHeaders).length;
              const isOnlyHeader = totalHeaders === 1;
              const isEmpty = !key.trim() && !value.trim();

              return (
                <div key={`new-header-${index}`} className="flex space-x-2">
                  <Input
                    placeholder="Header name"
                    value={getDisplayHeaderKey(key)}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      onNewHeadersChange(
                        updateHeaderKey(newHeaders, key, newKey)
                      );
                    }}
                    isError={!isValidHeaderKey(getDisplayHeaderKey(key))}
                  />
                  <Input
                    placeholder="Header value"
                    value={value}
                    onChange={(e) => {
                      onNewHeadersChange(
                        updateHeaderValue(newHeaders, key, e.target.value)
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
                        onNewHeadersChange(removeHeader(newHeaders, key));
                      }}
                    />
                  )}
                </div>
              );
            })
          : Object.keys(visibleExistingHeaders).length === 0 && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                No custom headers added yet. Click "Add Header" to get started.
              </div>
            )}
        <Button
          variant="outline"
          size="sm"
          label="Add Header"
          onClick={() => {
            onNewHeadersChange(addNewHeader(newHeaders));
          }}
        />
      </div>
    </div>
  );
}
