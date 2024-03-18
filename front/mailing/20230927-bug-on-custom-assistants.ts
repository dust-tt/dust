import sgMail from "@sendgrid/mail";

import { frontSequelize } from "@app/lib/resources/storage";

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
    subject: "[Dust] Resolved: access to your custom assistants",
    html: `<p>Hi there—</p>
    <p>I'm Stan, a cofounder of Dust.</p>
    <p>Thanks for trying us out. We noticed that you tried creating at least one custom assistant over the last few days. Due to an issue on our end, these assistants didn't show up in your workspace as a free user and you weren't able to start conversations with them.</p>
    <p>Sincere apologies for that, it's not the experience we wanted you to have when giving us a spin. This is now fixed and you should be able to view, edit, and interact with your assistants, custom or not, in your workspace.</p>
    <p>We're working hard to make Dust a useful tool for you and your team. If you have any thoughts or suggestions on what we should do better, please don't hesitate to let me know. Again, really appreciate you giving us a try.</p>
    <p>Stan</p>
`,
  };

  await sgMail.send(msg);

  console.log("EMAIL SENT", user_email);
};

async function main() {
  const [rows] = await frontSequelize.query(
    `select max(ws.name) ws_name, max(ws."sId") ws_sid, u.name user_name, u.email user_email, u.id user_id
    from
        agent_generation_configurations agc
        inner join agent_configurations ac on ac."generationConfigurationId" = agc.id
        inner join workspaces ws on ws.id = ac."workspaceId"
        inner join memberships m on m."workspaceId" = ws.id
        inner join users u on m."userId" = u.id
    where
        agc."modelId" ilike 'gpt-3%' or agc."modelId" ilike 'claude-instant%'
        and ws.plan not ilike '%"largeModels":true%'
        and m.role = 'admin'
    group by u.id
          `
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
