import {
  useEdgeeConnection,
  useSaveEdgeeConnection,
} from "@app/hooks/useEdgeeConnection";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Input, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface EdgeeConnectionSectionProps {
  owner: LightWorkspaceType;
}

export function EdgeeConnectionSection({ owner }: EdgeeConnectionSectionProps) {
  const { t } = useLingui();
  const { edgeeConnection, isEdgeeConnectionLoading } = useEdgeeConnection({
    owner,
  });
  const { saveEdgeeConnection, isSaving } = useSaveEdgeeConnection({ owner });
  const [organizationId, setOrganizationId] = useState("");
  const [adminToken, setAdminToken] = useState("");

  const handleSave = async () => {
    const saved = await saveEdgeeConnection({ adminToken, organizationId });
    if (saved) {
      setAdminToken("");
      setOrganizationId("");
    }
  };

  const connectedOrganizationId = edgeeConnection?.organizationId;
  const isDisabled = isSaving || isEdgeeConnectionLoading;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Page.H variant="h6">Edgee</Page.H>
      <div className="text-sm text-muted-foreground">
        {connectedOrganizationId ? (
          <Trans>
            Model calls go through the Edgee organization{" "}
            {connectedOrganizationId}. Each member gets their own Edgee key on
            their first call.
          </Trans>
        ) : (
          <Trans>
            Connect your Edgee organization to start using models. Each member
            gets their own Edgee key on their first call.
          </Trans>
        )}
      </div>
      <Input
        placeholder={t`Edgee organization ID`}
        value={organizationId}
        onChange={(e) => setOrganizationId(e.target.value)}
        disabled={isDisabled}
      />
      <Input
        placeholder={t`Edgee personal access token`}
        value={adminToken}
        onChange={(e) => setAdminToken(e.target.value)}
        disabled={isDisabled}
      />
      <div>
        <Button
          label={connectedOrganizationId ? t`Update` : t`Connect`}
          onClick={handleSave}
          disabled={!organizationId.trim() || !adminToken.trim() || isDisabled}
        />
      </div>
    </div>
  );
}
