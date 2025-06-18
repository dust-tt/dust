import {
  makeAudienceUri,
  makeEnterpriseConnectionInitiateLoginUrl,
  makeSamlAcsUrl,
} from "@app/lib/api/enterprise_connection";
import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace SID to ensure MCP server views for",
      required: true,
    },
  },
  async ({ workspaceId }) => {
    const workspace = await Workspace.findOne({
      where: {
        sId: workspaceId,
      },
    });
    if (!workspace) {
      throw new Error(`Workspace with SID ${workspaceId} not found.`);
    }

    const owner = renderLightWorkspaceType({ workspace });

    console.log("Audience url: ", makeAudienceUri(owner));
    console.log("SAML ACS url: ", makeSamlAcsUrl(owner));
    console.log(
      "Login url: ",
      await makeEnterpriseConnectionInitiateLoginUrl(workspaceId, null)
    );
  }
);
