import sgMail from "@sendgrid/mail";

import { frontSequelize } from "@app/lib/resources/storage";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendAPIUserEmail = async ({ email }: { email: string }) => {
  const msg = {
    to: email,
    from: "spolu@dust.tt",
    subject: "[Dust] Resolved: OpenAI Outage",
    html: `<p>Hi!</p>
    <p>Between 14:50 UTC and 15:30 UTC today, OpenAI encountered a major outage of their APIs. The incident is resolved and all services on Dust are now operational.</p>
    <p>We'd love to give you some context on our dependency on OpenAI: We rely heavily on OpenAI (vs Azure or other models) because we believe it's important for you that we incorporate new capabilities (e.g. the upcoming gpt-4 turbo) as soon as they are available. Not 6 months later.</p>
    <p>That being said, we will be looking into mitigating this dependency by building more capabilities to fallback on Azure infrastructure or other model providers for most of our services, for when such outages happen.</p>
    <p>While an outage like this one is disrupting, this is also a remainder that we are evolving in a nascent ecosystem, exploring with you the boundaries of what humans can do with models.</p>
    <p>-stan</p>
`,
  };

  await sgMail.send(msg);

  console.log("EMAIL SENT", email);
};

async function main() {
  const [rows] = await frontSequelize.query(
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
