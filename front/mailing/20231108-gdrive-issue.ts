import sgMail from "@sendgrid/mail";

import { front_sequelize } from "@app/lib/databases";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendAPIUserEmail = async ({
  user_email,
}: {
  user_email: string;
}) => {
  const msg = {
    to: user_email,
    from: "spolu@dust.tt",
    subject:
      "[Dust] Resolved: Google Drive most recent documents not available for retrieval",
    html: `<p>Hi there,</p>
    <p>I'm Stan, a cofounder of Dust.</p>
    <p>Thanks a lot for using Dust. Between 10:18 UTC and XXX UTC google drive syncing was interrupted due to a problem on our end. During that time, assistants performing retrieval did not have access to your latest Drive documents. The rest of the app worked normally.</p>
    <p>Sincere apologies for that, it's not the experience we wanted you to have when giving us a spin. This is now resolved and the google drive connection is fully synced.</p>
    <p>We're working hard to make Dust a useful tool for you and your team. If you have any thoughts or suggestions on what we should do better, please don't hesitate to let me know. Again, really appreciate you trusting us for your business.</p>
    <p>- stan</p>
`,
  };

  await sgMail.send(msg);

  console.log("EMAIL SENT", user_email);
};

async function main() {
  const [rows] =
    await front_sequelize.query(`SELECT "data_sources"."connectorId", "workspaces"."sId", "workspaces"."name", "users"."email" user_email
  FROM "data_sources"
  JOIN "workspaces" ON "data_sources"."workspaceId" = "workspaces"."id"
  JOIN "memberships" ON "workspaces"."id" = "memberships"."workspaceId"
  JOIN "users" ON "memberships"."userId" = "users"."id"
  WHERE "data_sources"."connectorId" IN ('151', '108', '181', '115', '122', '42', '69', '138', '213', '24', '76', '208', '220', '218', '236', '152', '187', '166', '100', '62', '60', '37')
  AND "memberships"."role" = 'admin';`);

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
    const chunk = chunks[i] as { user_email: string }[];
    console.log("SENDING CHUNK", i, chunk.length);
    await Promise.all(
      chunk.map((row) => {
        console.log("PREPARING EMAIL", row.user_email);
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
