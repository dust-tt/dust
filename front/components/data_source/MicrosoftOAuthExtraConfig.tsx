import { classNames, Input, SliderToggle } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";

export function MicrosoftOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  const [useServicePrincipal, setUseServicePrincipal] = useState(false);

  useEffect(() => {
    setIsExtraConfigValid(
      !useServicePrincipal ||
        (!!extraConfig.client_id && !!extraConfig.client_secret)
    );
  }, [useServicePrincipal, extraConfig, setIsExtraConfigValid]);

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
      </div>
    </>
  );
}
