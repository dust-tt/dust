import { sendEmail } from "@app/lib/api/email";

const { LIVE, SENDGRID_API_KEY } = process.env;

async function main() {
  console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);
  // Based on
  // https://app.datadoghq.eu/dashboard/mb2-nhc-u7m/front-status?fullscreen_end_ts=1701875635229&fullscreen_paused=false&fullscreen_refresh_mode=sliding&fullscreen_section=overview&fullscreen_start_ts=1699283635229&fullscreen_widget=4743851004952558&refresh_mode=sliding&from_ts=1699283629689&to_ts=1701875629689&live=true
  // const workspaces = [
  //   "1d29eb6b47",
  //   "8f05557978",
  //   "96cb06bed6",
  //   "2964a06ea8",
  //   "8198bfe6b1",
  //   "81163724ee",
  // ];

  const emails = [
    "maximecattet@gmx.com",
    "thecodinghouse12@gmail.com",
    "satendra12cs@gmail.com",
    "curiositykernel24@gmail.com",
    "me@yoheinakajima.com",
    "oliranneries@gmail.com",
    "nl.lorenz@gmx.de",
    "team@dust.tt",
    "spolu@proton.me",
  ];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    console.log("SENDING EMAIL", email);
    if (LIVE) {
      await sendCancelSubscriptionEmail(email);
    }
  }
}

export async function sendCancelSubscriptionEmail(
  email: string
): Promise<void> {
  const cancelMessage = {
    from: {
      name: "Stanislas Polu",
      email: "spolu@dust.tt",
    },
    subject: `[Dust] Action Required: legacy API`,
    text: `Hi!

First of all, thank you for being a long time user of Dust! We've evolved a lot since you first
signed up and started using us. I invite you to check out our landing (https://dust.tt) for a quick
overview of our current focus on amplifying teams potential with customizable and secure AI
assistants. Our platform is extensible as you can turn any of your current Dust app into an
assistant action. If you give it a spin, I'd love your feedback.

We noticed that you are still using our legacy API routes (https://dust.tt/api/v1/apps/[user]/...)
which were deprecated in June and are scheduled for shutdown on December 15th. This is a final
remainder before shutdown of these legacy routes.

To upgrade to the new routes you simply need to replace '/api/v1/apps/[user]/...' with
'/api/v1/w/[workspace]/apps/...'. Your workspace can be found by logging in Dust and looking at the
URL, or clicking on Deploy on your associated Dust app.

Happy to help you with this process of course. Simply answer to this email.

Best speed,

-stan
`,
  };
  return sendEmail(email, cancelMessage);
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
