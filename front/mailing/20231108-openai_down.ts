import sgMail from "@sendgrid/mail";

import { front_sequelize } from "@app/lib/databases";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendAPIUserEmail = async ({ email }: { email: string }) => {
  const msg = {
    to: email,
    from: "spolu@dust.tt",
    subject: "[Dust] OpenAI Outage",
    html: `<p>Hi there—</p>
    <p>I'm Stan, a cofounder of Dust.</p>
    <p>Since 2:54 UTC today, OpenAI is encountering a full outage of their APIs. They are investigating the issue. You can check their status here: https://status.openai.com/</p>
    <p>Most of our services are directly impacted, and we apologize for the inconvenience. You can keep using assitants based on non-OpenAI models that do not rely on any retrieval from data sources.</p>
    <p>We are closely monitoring the situation and will keep you posted as soon as the incident is resolved.</p>
    <p>-stan</p>
`,
  };

  await sgMail.send(msg);

  console.log("EMAIL SENT", email);
};

async function main() {
  const [rows] = await front_sequelize.query(
    `SELECT w.name, w."sId", u.name, u.email FROM subscriptions s
INNER JOIN workspaces w ON s."workspaceId" = w.id
INNER JOIN memberships m ON m."workspaceId" = w.id
INNER JOIN users u ON m."userId" = u.id
WHERE s.status = 'active'
AND m.role = 'admin'`
  );

  console.log({ count: rows.length });

  console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);

  // split rows in chunks of 16
  const chunks = [];
  let chunk = [];
  for (let i = 0; i < rows.length; i++) {
    chunk.push(rows[i]);
    if (chunk.length === 16) {
      chunks.push(chunk);
      chunk = [];
    }
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as { email: string }[];
    console.log("SENDING CHUNK", i, chunk.length);
    await Promise.all(
      chunk.map((row) => {
        console.log("PREPARING EMAIL", row.email);
        if (LIVE && LIVE === "true") {
          return sendAPIUserEmail(row);
        } else {
          return Promise.resolve();
        }
      })
    );
  }

  process.exit(0);
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
