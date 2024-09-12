import sgMail from "@sendgrid/mail";

import { frontSequelize } from "@app/lib/resources/storage";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendIncidentEmail = async ({
  email,
  assistants,
}: {
  email: string;
  assistants: {
    workspaceName: string;
    workspaceId: string;
    agentName: string;
    agentId: string;
    assistantBuilderURL: string;
  }[];
}) => {
  const msg = {
    to: email,
    // to: "spolu@pm.me",
    from: "spolu@dust.tt",
    subject:
      "[Dust] Resolved incident: Assistant Table Query configurations issue",
    html: `<p>Hi there,</p>
    <p>An erroneous deletion logic introduced on Sept 4th impacted the selection of tables in assistants relying on the Query Tables action. We fixed the issue and were able to recover the last valid selection of tables for assistants that were used in the past 4 weeks. Inactive assistants may still be affected.</p>
    <p>As last editor of the following assistants relying on Table Query, we invite you to check and potentialy repair the Query Tables action configuration for each of them:</p>
    <ul>
    ${assistants.map((a) => `<li>${a.agentName}: <a href="${a.assistantBuilderURL}">${a.assistantBuilderURL}</a></li>`).join("\n")}
    </ul>
    <p>We take the safety of your assitant configurations very seriously, a full incident report is availabe here[0]. As an editor of assistants, your contribution is key to the success of Dust. Please simply reply to this email if you have any outstanding questions, we're here to help.</p>
    <p>-stan</p>
    <p>[0] <a href="https://dust-tt.notion.site/Incident-L2-Table-Query-Configuration-Loss-5f68431d4f3d4542ae833b8900ea0cc1">https://dust-tt.notion.site/Incident-L2-Table-Query-Configuration-Loss-5f68431d4f3d4542ae833b8900ea0cc1</a>
`,
  };

  if (LIVE) {
    await sgMail.send(msg);
    // console.log(r);
    console.log("EMAIL SENT", email);
  } else {
    console.log(msg);
  }
};

async function main() {
  const [rows] = (await frontSequelize.query(`
SELECT
  "w"."name" AS "workspaceName",
  "w"."sId" AS "workspaceId",
  "ac"."name" AS "agentName",
  "ac"."sId" AS "agentId",
  COUNT("atqc"."id") AS "queryConfigCount",
  COUNT("atqct"."id") AS "queryConfigTableCount",
  "u"."email" AS "authorEmail"
FROM "workspaces" "w"
JOIN "agent_configurations" "ac" ON "w"."id" = "ac"."workspaceId"
JOIN "users" "u" ON "ac"."authorId" = "u"."id"
JOIN "agent_tables_query_configurations" "atqc" ON "ac"."id" = "atqc"."agentConfigurationId"
LEFT JOIN "agent_tables_query_configuration_tables" "atqct" ON "atqc"."id" = "atqct"."tablesQueryConfigurationId"
WHERE "ac"."status" = 'active'
GROUP BY "w"."name", "w"."sId", "ac"."name", "ac"."sId", "u"."email"
HAVING COUNT("atqct"."id") = 0
`)) as {
    workspaceName: string;
    workspaceId: string;
    agentName: string;
    agentId: string;
    queryConfigCount: number;
    queryConfigTableCount: number;
    authorEmail: string;
  }[][];

  // console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);

  const emailToAssistants: Record<
    string,
    {
      workspaceName: string;
      workspaceId: string;
      agentName: string;
      agentId: string;
      assistantBuilderURL: string;
    }[]
  > = {};

  for (const row of rows) {
    if (!emailToAssistants[row.authorEmail]) {
      emailToAssistants[row.authorEmail] = [];
    }
    emailToAssistants[row.authorEmail].push({
      workspaceName: row.workspaceName,
      workspaceId: row.workspaceId,
      agentName: row.agentName,
      agentId: row.agentId,
      assistantBuilderURL: `https://dust.tt/w/${row.workspaceId}/builder/assistants/${row.agentId}`,
    });
  }

  console.log(emailToAssistants);

  for (const [email, assistants] of Object.entries(emailToAssistants)) {
    await sendIncidentEmail({ email, assistants });
  }
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
