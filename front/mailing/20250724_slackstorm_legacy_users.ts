import sgMail from "@sendgrid/mail";
import assert from "assert";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

const { SENDGRID_API_KEY = "", LIVE = false, REGION = "DEV" } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

function workspaceUrl(auth: Authenticator) {
  if (REGION === "DEV") {
    return `http://localhost:3000/w/${auth.getNonNullableWorkspace().sId}/`;
  }
  if (REGION === "US") {
    return `https://dust.tt/w/${auth.getNonNullableWorkspace().sId}/`;
  }
  if (REGION === "EU") {
    return `https://eu.dust.tt/w/${auth.getNonNullableWorkspace().sId}/`;
  }
  assert(false);
}

async function contactWorkspace(
  workspace: WorkspaceResource,
  ds: DataSourceModel
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const [dataSource] = await DataSourceResource.fetchByModelIds(auth, [ds.id]);

  assert(dataSource, `Data source not found for ID ${ds.id} ${workspace.sId}`);

  const admins = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });

  const dataSourceViews = await DataSourceViewResource.listForDataSources(
    auth,
    [dataSource]
  );
  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
  const systemDataSourceView = dataSourceViews.find(
    (view) => view.space.sId === systemSpace.sId
  );

  assert(systemDataSourceView, "System data source view not found");

  const email = `Hi there,

We're writing because your Slack connection on Dust needs attention.

What's happening: Slack updated its terms of service, with some changes
effective September 2nd, 2025 for your Slack connection. Read details on the
changes by Slack here: [0]. Slack excluded from their terms of service any use
case involving ingesting Slack data for indexation at a third-party (Slack
DataSource). Interaction with Dust agents from within Slack (Slack Bot) remains
a permitted use case but now requires to be done using an app officially
published on the marketplace.

# What we're doing

We previously had a single unpublished Dust application[1] to manage Slack
(Slack DataSource and Slack Bot). To address Slack's updated API terms of
service, we are splitting our Slack application into two applications:

- A new one[2] (officially published on the marketplace) that allows you to
  summon @Dust in Slack (the "Slack Bot" app)
- The existing one[1] that will continue to manage Slack as a data source for
  your workspace (the "DataSource" app)

We will sunset the use of the current app[1] for interacting with Dust on Slack
on August 1st following these steps:

- On July 25th (tomorrow) we will rename the current @Dust app to
  @Dust-Deprecated, users will still be able to interact with it.
- On August 1st the @Dust-Deprecated will stop responding to users request on
  Slack.

# How this impacts you

To avoid disruption for your users you can migrate to the new "Slack Bot" app
by:

- Deactivating the old app Slack Bot capabilities ('Manage Slack'
  button):
  ${workspaceUrl(auth)}spaces/${systemSpace.sId}/categories/managed/data_source_views/${systemDataSourceView.sId}
- Activating the new Slack bot (the option will appear only after the previous
  step is complete):
  ${workspaceUrl(auth)}workspace

You will need to invite the new @Dust app to relevant channels in case your
users are not allowed to do so. If you perform this switch before July 25th note
that you will have two @Dust bots co-existing on your workspace but only the new
one will be able to respond to user queries. That's why we suggest you perform
the switch only after we rename the old app to @Dust-Deprecated (tomorrow).

# What happens next

Additionally, The "Connection" app (soon to be named @Dust-Deprecated) will be
subject to rate limits preventing the maintenance of your Slack Data Source
starting September 2nd, 2025. To comply with Slack Terms we will have to delete
your Slack Data Source on that date (we'll communicate again when that
happens).

We have released a set of Slack tools relying on new Slack Search APIs to
mitigate this and we invite you to start migrating your agents to this set of
tools instead of relying on search in your Slack Data Source.

Please reply to this email if you have any questions. We are here to help
through this transition.

-stan (co-founder)

[0] https://dust-tt.notion.site/Slack-Terms-of-Service-update-and-API-Changes-21728599d94180f3b2b4e892e6d20af6?pvs=74
[1] https://slack.com/marketplace/A055TBYBUG1-dust-deprecated
[2] https://slack.com/marketplace/A09214D6XQT-dust
`;

  const msg = {
    to: admins.members.map((a) => a.email),
    from: "team@dust.tt",
    cc: admins.members.map((a) => a.email).includes("spolu@dust.tt")
      ? undefined
      : "spolu@dust.tt",
    subject: "[Dust] Slack terms update - Action required",
    text: email,
  };

  if (LIVE) {
    console.log(`-----------------------------------`);
    console.log(`Workspace ID: ${workspace.sId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.to}`);
    console.log("");
    console.log(email);
    console.log("");
    console.log("SENDING");
    await sgMail.send(msg);
  } else {
    console.log(`-----------------------------------`);
    console.log(`WorkspaceId: ${workspace.sId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.to}`);
    console.log("");
    console.log(email);
  }
}

async function main() {
  assert(["US", "EU", "DEV"].includes(REGION), `Invalid REGION: ${REGION}`);

  const slackDataSources = await DataSourceModel.findAll({
    where: {
      connectorProvider: "slack",
    },
  });
  const workspaces = new Map(
    (
      await WorkspaceResource.fetchByModelIds(
        slackDataSources.map((ds) => ds.workspaceId)
      )
    ).map((w) => [w.id, w])
  );

  assert(slackDataSources.length === workspaces.size);

  console.log(`Found ${workspaces.size} workspaces with Slack Data Sources`);

  for (const ds of slackDataSources) {
    const workspace = workspaces.get(ds.workspaceId);
    assert(workspace, `Workspace not found for data source ${ds.id}`);

    await contactWorkspace(workspace, ds);
  }
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
