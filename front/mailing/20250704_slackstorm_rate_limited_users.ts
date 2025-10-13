import sgMail from "@sendgrid/mail";
import assert from "assert";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

const { SENDGRID_API_KEY = "", LIVE = false, REGION = "DEV" } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

const RATE_LIMITED_WORKSPACES = {
  DEV: ["6edJnrdZsJ"],
  US: [
    "W5BnQgy1EP",
    "iRKOYwvPDv",
    "Qi0vLYdQJl",
    "NEKBvXUKFt",
    "bOYaMu7y9c",
    "nHghisxF6X",
    "Q3RFVkFAAs",
    "MbwNpDmwyg",
    "5FPL0pHXw9",
    "UrnjwfV0BN",
    "vHDrR1vVyB",
    "HttspWSc8x",
    "iHdtunVvBD",
    "gEvevm9twh",
    "ca3aBQGFCW",
    "IHFm6p6d6b",
    "7IQKLzDxiS",
    "s2jpMnqNVF",
    "LHsHjBkCcc",
    "b396f0c630",
    "MqgvwpozmQ",
    "XEBATwxLL0",
    "a5xajqwJH7",
    "fxCcH1YP0w",
    "iQHJaacMAs",
    "F4fk1mBydA",
    "f7vXTXeTm8",
    "leNZc3IlWi",
    "ecmoihU1OA",
    "mDHseGkXK6",
    "54b4fe2b13",
    "N7d3UvAdUO",
    "Yj0GpVZEZJ",
    "jAcbsyM77K",
    "p0Z3Kyclps",
    "lOrOz8ym4B",
    "qRw0Q0o3gQ",
    "3TEfKpZTZU",
    "sKveVi7Yhh",
    "IQMJGQKI0v",
    "6UdC4rXnUl",
    "Iix98Q3N4Q",
    "289811049d",
    "cnI4782Tfb",
    "Yzk5h3oVoY",
    "ppAm266lT1",
    "p88p7oksWM",
    "jO5uob3uVe",
    "EQTGrSLQoB",
    "fcVKpuGpCK",
    "zaUhfeQ3HT",
    "s0INfoZMzO",
    "1Oak112ZXm",
    "QlyhnO1us5",
    "2QPUoMiWKO",
    "dUmyNZnSoM",
    "JfA2alO9Ws",
    "BpI9r3N2Vp",
    "dBgj3Y3q9L",
  ],
  EU: ["UPCx3vzjNU", "gj7uFHOGFb", "5sV32qY0CX", "HHFB1w6czS"],
};

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

async function contactWorkspace(workspaceId: string) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const admins = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });

  // get the slack data source
  const slackDataSources = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack"
  );

  // get the system space
  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

  const dataSourceViews = await DataSourceViewResource.listForDataSources(
    auth,
    slackDataSources
  );
  const viewsUsageByAgentsRes = await Promise.all(
    dataSourceViews.map((view) => view.getUsagesByAgents(auth))
  );

  const viewsUsedByAgents = viewsUsageByAgentsRes.reduce((acc, usageRes) => {
    if (usageRes.isOk() && usageRes.value.count > 0) {
      usageRes.value.agents.forEach((a) => acc.add(a));
    }
    return acc;
  }, new Set<{ name: string; sId: string }>());

  let email = `Hi there,

We're following up in the context of Slack's update to its terms in the context
of Dust[0].

# What's happening

We have confirmed with Slack that our connection use case is now outside the
scope of their terms of use. As a result, we will delete your Slack connection
on July 15th, 2025.

# What we're doing

To mitigate this loss of capability, we have created a Slack MCP server[1] that
provides tools your agents can use to search in Slack by keyword and also post
messages in Slack. These tools require user credentials: the users of an agent
that uses them will be prompted to authenticate with Slack directly the first
time they use it.

While the search by keyword provided by Slack today is not as powerful as our
previous semantic search capabilities, we are actively working with Slack to
support their upcoming APIs as part of this new MCP server.

We're also happy to announce that the Dust Slack app that allows you to summon
Dust agents in Slack is now officially listed on the Slack marketplace and
benefits from higher rate limits.

# What it means for you

(i) If you haven't already, you can enable the Slack integration to summon Dust
    agents from Slack in your workspace settings.

(ii) You can enable the new Slack tools under 'Space > Administration >
     Tools'[2] so that they can be used in agents relying on Slack.`;

  if (viewsUsedByAgents.size > 0) {
    email += `

(iii) The deletion of your existing Slack connection will impact the following
      agents on your workspace:

`;
    viewsUsedByAgents.forEach((agent) => {
      email += `${agent.name} - ${workspaceUrl(auth)}agent/new?agentDetails=${agent.sId}\n`;
    });

    email += `
You will need to migrate these agents to the new Slack tools to maintain their
capabilities.`;
  }

  email += `

Please reply to this email if you have any questions.

The Dust team.


[0] https://dust-tt.notion.site/Slack-Terms-of-Service-update-and-API-Changes-21728599d94180f3b2b4e892e6d20af6
[1] https://docs.dust.tt/docs/slack-mcp
[2] ${workspaceUrl(auth)}spaces/${systemSpace.sId}/categories/actions
`;

  const msg = {
    to: admins.members.map((a) => a.email),
    from: "team@dust.tt",
    cc: admins.members.map((a) => a.email).includes("spolu@dust.tt")
      ? undefined
      : "spolu@dust.tt",
    subject: "[Dust] Follow-up on Slack terms update - Action required",
    text: email,
  };

  if (LIVE) {
    console.log(`-----------------------------------`);
    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.to}`);
    console.log("");
    console.log(email);
    console.log("");
    console.log("SENDING");
    await sgMail.send(msg);
  } else {
    console.log(`-----------------------------------`);
    console.log(`WorkspaceId: ${workspaceId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.to}`);
    console.log("");
    console.log(email);
  }
}

async function main() {
  assert(REGION in RATE_LIMITED_WORKSPACES, `Invalid REGION: ${REGION}`);

  for (const workspaceId of RATE_LIMITED_WORKSPACES[REGION as "EU" | "US"]) {
    await contactWorkspace(workspaceId);
  }
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
