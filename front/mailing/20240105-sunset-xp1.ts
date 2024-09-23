// const { LIVE, SENDGRID_API_KEY } = process.env;

import { sendEmail } from "@app/lib/api/email";

// async function main() {
//   console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);
//
//   const users = await XP1User.findAll();
//   const emails = users.map((u) => u.email);
//
//   for (let i = 0; i < emails.length; i++) {
//     const email = emails[i];
//     console.log("SENDING EMAIL", email);
//     if (LIVE) await sendSunsetXP1Email(email);
//   }
// }

export async function sendSunsetXP1Email(email: string): Promise<void> {
  const message = {
    from: {
      name: "Stanislas Polu",
      email: "spolu@dust.tt",
    },
    subject: `👋 XP1, Welcome Dust!`,
    text: `Hi!

First of all, thank you for being a long time user of XP1! We've evolved a lot since you first
signed up for it. As a result, we'll be sunsetting XP1[0] on January the 15th, 2024 as we focus on
team productivity vs single-player mode.

Dust lets you amplify your team's potential with customizable and secure AI assistants.

https://dust.tt.

Ping me if you have any question or would like a discount code to get a 50% off your first 3 months
on Dust.

Best speed,

-stan

[0] all your data (usage statistics and account information) will be deleted.
`,
  };
  await sendEmail(email, message);
}

// void main().then(() => {
//   console.log("DONE");
//   process.exit(0);
// });
