import { classNames, Input, SliderToggle, TextArea } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";

export function MicrosoftOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  const initialServicePrincipal =
    !!extraConfig.client_id ||
    !!extraConfig.client_secret ||
    !!extraConfig.tenant_id ||
    !!extraConfig.selected_sites;

  const [useServicePrincipal, setUseServicePrincipal] = useState(
    initialServicePrincipal
  );

  const selectedSitesValue = useMemo(() => {
    const raw = extraConfig.selected_sites;
    if (!raw) {
      return "";
    }
    if (Array.isArray(raw)) {
      return raw.join("\n");
    }
    return raw;
  }, [extraConfig.selected_sites]);

  useEffect(() => {
    setIsExtraConfigValid(
      !useServicePrincipal ||
        (!!extraConfig.client_id &&
          !!extraConfig.client_secret &&
          !!extraConfig.tenant_id &&
          selectedSitesValue.trim().length > 0)
    );
  }, [
    useServicePrincipal,
    extraConfig,
    selectedSitesValue,
    setIsExtraConfigValid,
  ]);

  useEffect(() => {
    if (!useServicePrincipal) {
      setExtraConfig((prev: Record<string, string>) => {
        const updated = { ...prev };
        delete updated.tenant_id;
        delete updated.client_id;
        delete updated.client_secret;
        delete updated.selected_sites;
        return updated;
      });
    }
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
            Selected SharePoint sites (one per line)
          </div>
          <TextArea
            placeholder={
              "contoso.sharepoint.com,1234abcd-...\ncontoso.sharepoint.com,5678efgh-..."
            }
            disabled={!useServicePrincipal}
            name="selected_sites"
            value={selectedSitesValue}
            onChange={(e) => {
              setExtraConfig((prev: Record<string, string>) => ({
                ...prev,
                selected_sites: e.target.value,
              }));
            }}
            minRows={4}
          />
          <div className="text-xs text-slate-500">
            Provide the SharePoint site identifiers assigned to the service
            principal. Enter one identifier per line.
          </div>
        </div>
      </div>
    </>
  );
}
