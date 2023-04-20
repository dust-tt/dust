import sgMail from "@sendgrid/mail";

import { XP1User } from "../lib/models.js";

const { SENDGRID_API_KEY, LIVE = false } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendFreeplanEmail = async (user) => {
  const msg = {
    to: user.email,
    from: "team@dust.tt",
    subject: "[DUST] Good news: you're now on XP1's Free plan",
    text: `Thank you for being among the first users of XP1!

# Summary

We've moved XP1 to OpenAI's gpt-3.5-turbo[0] model. Given its reduced
cost we've decided to put you on a free plan and won't be charged
going forward. We look forward to helping you get more done, faster,
as we continue to build.

# You're now on a free plan. Please upgrade your Chrome extension.

Last week, OpenAI released gpt-3.5-turbo[0] which is ten times
cheaper than previous versions. We've transitioned XP1 to use this
model and decided to move users to a new Free plan.

We've canceled your Stripe subscription and you won't be charged going
forward. If prompted to do so, please update your extension[1] as part
of the transition.

Dust's vision is to deliver a “productivity OS for smart teams” for
people working at computers to get more done, faster, and get back to
focusing on more interesting things. We will continue to iterate on
our product (collectively, XP1 and Dust) and build features that may
become part of a paid plan in the future. We'll keep you updated on
that as we progress.

# We're excited to build and explore

It's still early days. Making the default plan for XP1 free gives us a
license to explore quickly, maybe break a few things along the way,
and hopefully impress you with delightful features on a regular basis.

That's it! Don't hesitate to reach out with questions, feature
requests, or simply to let us know how you save time with XP1.

The Dust team

[0] https://openai.com/blog/introducing-chatgpt-and-whisper-apis
[1] https://chrome.google.com/webstore/detail/dust-xp1/okgjeakekjeppjocmfaeeeaianominge
`,
  };

  await sgMail.send(msg);

  console.log("UPGRADE & ACTIVATION KEY SENT", user.email);
};

async function main() {
  let users = await await XP1User.findAll();

  console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);

  users.forEach((u) => {
    console.log("USER", u.id, u.email);
  });

  // split users in chunks of 16
  let chunks = [];
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
          return sendFreeplanEmail(u);
        } else {
          return Promise.resolve();
        }
      })
    );
  }

  process.exit(0);
}

await main();
