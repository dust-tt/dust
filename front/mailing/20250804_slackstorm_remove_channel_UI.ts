import sgMail from "@sendgrid/mail";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

const AGENTS_WITH_SLACK_CHANNELS: Record<string, string[]> = {
  // "0ec9852c2f": [
  //   "PrepMyDayNew",
  //   "designDaily",
  //   "testpr",
  //   "nknkjn",
  //   "Dayplanner",
  //   "DustWriter",
  //   "HubspotDataChecker",
  // ],
  "98f7d7de51": ["ITsupportExpert"],
  aBYzD8sCOU: [
    "MyTO-DO",
    "MySlack",
    "PartnershipsOps",
    "PromoteNewLinkedinPost",
    "slacktest",
    "PartnerWorkspace",
  ],
  "0cXv21bQrS": [
    "CompetitorIntelWeekly",
    "ProductReleaseInsightCSM",
    "RISEIntelWeekly",
    "SupportDocAI",
    "TicketDocAnalyst",
  ],
  FZ2ztiJtR0: ["ReportingAnalyst"],
  Z0H0NerNgV: ["AdomikDashboardAnalyst_Snow"],
  GnR3Nv3Xz4: ["Anniversary-Email"],
  dH7AtkFV5H: ["Notion Harvester"],
  YBl4G8tCDQ: ["CEOCoPilot"],
  EFCwnFbGBF: ["Product Intelligence", "VividlyPMM"],
  LVMHlWJcaS: ["MeetingMaster"],
  v3FihA4Jhj: ["ProvidenceHealthAgent"],
  S52kOdSTE1: ["research"],
};

async function contactWorkspace(workspaceId: string, agents: string[]) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const admins = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });

  let email = `Hi there,

A few weeks ago, we added support for selecting specific Slack channels to
search within when using the Slack search tool. This feature is now being
removed as we concluded that it added unnecessary complexity.

Instead, you can simply include the list of channels to search within their
instructions, for example: "Search only in Slack channels #general and #random".

Your workspace has the following agents which were using the Slack channel
selection feature:

`;

  agents.forEach((agent) => {
    email += `- ${agent}\n`;
  });

  email += `
To avoid breaking their functionality, we have updated these agents to include
the list of channels they were configured to search directly in their
instructions. You can review and modify these instructions as needed.

Please reply to this email if you have any questions.

The Dust team.
`;

  const msg = {
    to: admins.members.map((a) => a.email),
    from: "team@dust.tt",
    cc: admins.members.map((a) => a.email).includes("spolu@dust.tt")
      ? undefined
      : "spolu@dust.tt",
    subject: "[Dust] Update on Slack channel selection feature",
    text: email,
  };

  if (LIVE) {
    console.log(`-----------------------------------`);
    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.subject}`);
    console.log("");
    console.log(email);
    console.log("");
    console.log("SENDING");
    await sgMail.send(msg);
  } else {
    console.log(`-----------------------------------`);
    console.log(`WorkspaceId: ${workspaceId}`);
    console.log(`To: ${msg.to.join(", ")}`);
    console.log(`Subject: ${msg.subject}`);
    console.log("");
    console.log(email);
  }
}

async function main() {
  for (const workspaceId of Object.keys(AGENTS_WITH_SLACK_CHANNELS)) {
    await contactWorkspace(
      workspaceId,
      AGENTS_WITH_SLACK_CHANNELS[workspaceId]
    );
  }
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
