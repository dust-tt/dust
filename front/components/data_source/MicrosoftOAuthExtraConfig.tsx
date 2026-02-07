import { classNames, Input, SliderToggle, TextArea } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";

export function MicrosoftOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  // Store the initial extraConfig values when they're first loaded
  const initialExtraConfigRef = useRef<Record<string, string>>({});
  const prevUseServicePrincipalRef = useRef<boolean>(!!extraConfig.client_id);

  const [useServicePrincipal, setUseServicePrincipal] = useState(
    !!extraConfig.client_id
  );

  const selectedSitesValue = extraConfig.selected_sites || "";

  // Store initial values when extraConfig is first populated with data
  useEffect(() => {
    if (
      extraConfig.client_id &&
      Object.keys(initialExtraConfigRef.current).length === 0
    ) {
      initialExtraConfigRef.current = { ...extraConfig };
    }
  }, [extraConfig]);

  // Update useServicePrincipal when extraConfig changes (e.g., when loading existing config)
  useEffect(() => {
    setUseServicePrincipal(!!extraConfig.client_id);
  }, [extraConfig.client_id]);

  useEffect(() => {
    setIsExtraConfigValid(
      !useServicePrincipal ||
        (!!extraConfig.client_id &&
          !!extraConfig.client_secret &&
          !!extraConfig.tenant_id)
    );
  }, [useServicePrincipal, extraConfig, setIsExtraConfigValid]);

  // Handle toggling service principal on/off
  useEffect(() => {
    const wasToggled =
      prevUseServicePrincipalRef.current !== useServicePrincipal;

    if (wasToggled) {
      if (!useServicePrincipal) {
        // Toggled to false - clear the fields
        setExtraConfig((prev: Record<string, string>) => {
          const updated = { ...prev };
          delete updated.tenant_id;
          delete updated.client_id;
          delete updated.client_secret;
          delete updated.selected_sites;
          return updated;
        });
      } else if (Object.keys(initialExtraConfigRef.current).length > 0) {
        // Toggled to true - restore initial values if they exist
        setExtraConfig(initialExtraConfigRef.current);
      }
    }

    prevUseServicePrincipalRef.current = useServicePrincipal;
  }, [useServicePrincipal, setExtraConfig]);

  return (
    <>
      <div className="flex justify-between">
        <div>Use a Service Principal</div>
        <SliderToggle
          selected={useServicePrincipal}
          onClick={() => setUseServicePrincipal(!useServicePrincipal)}
        />
      </div>
      {useServicePrincipal && (
        <div
          className={classNames(
            "flex flex-col gap-2",
            !useServicePrincipal ? "opacity-50" : ""
          )}
        >
          <Input
            label="Tenant ID"
            disabled={!useServicePrincipal}
            name="tenant_id"
            value={extraConfig.tenant_id ?? ""}
            onChange={(e) => {
              setExtraConfig((prev: Record<string, string>) => ({
                ...prev,
                tenant_id: e.target.value,
              }));
            }}
          />
          <Input
            label="Client ID"
            disabled={!useServicePrincipal}
            name="client_id"
            value={extraConfig.client_id ?? ""}
            onChange={(e) => {
              setExtraConfig((prev: Record<string, string>) => ({
                ...prev,
                client_id: e.target.value,
              }));
            }}
          />
          <Input
            label="Service Account secret"
            disabled={!useServicePrincipal}
            name="client_secret"
            type="password"
            value={extraConfig.client_secret ?? ""}
            onChange={(e) => {
              setExtraConfig((prev: Record<string, string>) => ({
                ...prev,
                client_secret: e.target.value,
              }));
            }}
          />
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-slate-700">
              Selected SharePoint sites Dust will have access to (one per line).
            </div>
            <TextArea
              placeholder={
                "contoso.sharepoint.com,1234abcd-...\ncontoso.sharepoint.com,5678efgh-..."
              }
              disabled={!useServicePrincipal}
              name="selected_sites"
              value={selectedSitesValue}
              onChange={(e) => {
                if (e.target.value.trim().length === 0) {
                  setExtraConfig((prev: Record<string, string>) => {
                    const updated = { ...prev };
                    delete updated.selected_sites;
                    return updated;
                  });
                } else {
                  setExtraConfig((prev: Record<string, string>) => ({
                    ...prev,
                    selected_sites: e.target.value,
                  }));
                }
              }}
              minRows={4}
            />
            <div className="text-xs text-slate-500">
              Provide the SharePoint site identifiers assigned to the service
              principal. Enter one identifier per line. This is not required if
              your Service Principal has access to all sites.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
