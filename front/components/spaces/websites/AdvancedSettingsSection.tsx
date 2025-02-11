import { Button, Collapsible, Input, Label, XMarkIcon } from "@dust-tt/sparkle";
import type { WebsiteFormAction, WebsiteFormState } from "@dust-tt/types";
import { WebCrawlerHeaderRedactedValue } from "@dust-tt/types";
import type { Dispatch } from "react";

export function AdvancedSettingsSection({
  state,
  dispatch,
}: {
  state: WebsiteFormState;
  dispatch: Dispatch<WebsiteFormAction>;
}) {
  return (
    <Collapsible>
      <Collapsible.Button label="Advanced settings" variant="secondary" />
      <Collapsible.Panel>
        <div className="flex w-full flex-col gap-3">
          <Label>Custom Headers</Label>
          <p>Add custom request headers for the web crawler.</p>
          <div className="flex flex-col gap-4">
            {state.headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex grow flex-col gap-1 px-1">
                  <Input
                    placeholder="Header Name"
                    value={header.key}
                    name="headerName"
                    onChange={(e) => {
                      const newHeaders = [...state.headers];
                      newHeaders[index].key = e.target.value;
                      dispatch({
                        type: "SET_FIELD",
                        field: "headers",
                        value: newHeaders,
                      });
                    }}
                    disabled={header.value === WebCrawlerHeaderRedactedValue}
                    className="grow"
                  />
                  <Input
                    name="headerValue"
                    placeholder="Header Value"
                    value={header.value}
                    onChange={(e) => {
                      const newHeaders = [...state.headers];
                      newHeaders[index].value = e.target.value;
                      dispatch({
                        type: "SET_FIELD",
                        field: "headers",
                        value: newHeaders,
                      });
                    }}
                    disabled={header.value === WebCrawlerHeaderRedactedValue}
                    className="flex-1"
                  />
                </div>
                <Button
                  variant="outline"
                  icon={XMarkIcon}
                  onClick={() => {
                    const newHeaders = state.headers.filter(
                      (_, i) => i !== index
                    );
                    dispatch({
                      type: "SET_FIELD",
                      field: "headers",
                      value: newHeaders,
                    });
                  }}
                />
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            label="Add Header"
            onClick={() => {
              dispatch({
                type: "SET_FIELD",
                field: "headers",
                value: [...state.headers, { key: "", value: "" }],
              });
            }}
          />
        </div>
      </Collapsible.Panel>
    </Collapsible>
  );
}
