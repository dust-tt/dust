import sgMail from "@sendgrid/mail";

import { User } from "@app/lib/models";
import { legacyUserToWorkspace } from "@app/pages/api/v1/legacy_user_to_workspace.js";

const { SENDGRID_API_KEY = "", LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendAPIUserEmail = async (user: User) => {
  const msg = {
    to: user.email,
    from: "spolu@dust.tt",
    subject: "[DUST] API route updates: breaking change on May 22, 2023",
    html: `<p>Hi there!</p>
<p>Thank you for being among the active users of the Dust platform!</p>
<p><b>## Summary</b></p>

<p>Importantly, we're introducing changes to the API route for deployed apps that requires <b>a
change on your part before May 22, 2023</b>. Also, we'd love to hear how we're doing and we're
excited to continue building for you, the builders.</p>

<p><b>## API route changes</b></p>

<p>We've rolled out support for Workspaces, a more structured way for teams to collaborate on Dust.
This will impact the API routes for deployed Dust applications. <b>We'll maintain the pre-existing
API routes you are currently using for another month, until May 22, 2023. By then, may we please ask
you to update your API route to <a href="https://docs.dust.tt/runs#create-a-run">include your
WorkspaceId</a>.</b> If you have any questions or concerns about this update process, please reach
out.</p>

<p><b>## Thanks for trusting Dust. How are we doing?</b></p>

<p>We're thrilled that you've been using Dust and in particular that you decided to host your active
Dust app with us. We'd really love to hear more about your experience using the Dust platform and
our API. What's been going well? What can we do better? What are you hoping for next? Just hit reply
and share your thoughts.</p>

<p><b>## Where should we take the platform next?</b></p>

<p>Dust's vision is to deliver the platform for modern teams to get more done, faster, so they can
focus on more interesting things. It's still early days. We'll continue to explore and iterate
quickly. We may break a few things along the way when it's required, but hopefully with the outcome
of always allowing you to build with better tools.</p>

<p>Again: please don't hesitate to reach out.</p>
<br/>
<p>-stan</p>
`,
  };

  await sgMail.send(msg);

  console.log("EMAIL SENT", user.email);
};

async function main() {
  const users = await User.findAll({
    where: {
      username: Object.keys(legacyUserToWorkspace),
    },
  });

  console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);

  users.forEach((u) => {
    console.log("USER", u.id, u.email);
  });

  // split users in chunks of 16
  const chunks = [];
  let chunk = [];
  for (let i = 0; i < users.length; i++) {
    chunk.push(users[i]);
    if (chunk.length === 16) {
      chunks.push(chunk);
      chunk = [];
    }
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log("SENDING CHUNK", i, chunk.length);
    await Promise.all(
      chunk.map((u) => {
        console.log("PREPARING EMAIL", u.email);
        if (LIVE && LIVE === "true") {
          return sendAPIUserEmail(u);
        } else {
          return Promise.resolve();
        }
      })
    );
  }

  process.exit(0);
}

void main()
  .then(() => {
    console.log("DONE");
    process.exit(0);
  })
  
