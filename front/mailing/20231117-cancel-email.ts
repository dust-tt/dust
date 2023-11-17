import { sendEmail } from "@app/lib/email";

/** Send emails to users who canceled their subscription before the automated emails were available */
const { LIVE, SENDGRID_API_KEY } = process.env;

async function main() {
  console.log("USING SENDGRID API KEY", SENDGRID_API_KEY);
  const emails = process.argv.slice(2); // Get command line arguments as emails

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    console.log("SENDING EMAIL", email);
    if (LIVE) await sendCancelSubscriptionEmail(email);
  }
}

export async function sendCancelSubscriptionEmail(
  email: string
): Promise<void> {
  const cancelMessage = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Subscription canceled - important information`,
    html: `<p>Hello from Dust,</p>
      <p>You recently canceled your subscription. It will be terminated at the end of your current billing period. You can reactivate your subscription at any time before then. If you do not reactivate your subscription, you will then be switched back to our free plan:</p>
      <ul>
      <li>all users but one will be removed from the workspace (details <a href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4">here</a>);</li>
      <li>connections will be removed and data safety deleted from Dust;</li>
      <li>conversations, custom assistants, and data sources will still be accessible with limitations;</li>
      <li>your usage of Dust will have the restrictions of the free plan.</li>
      </ul>
      <p>More details are available on <a href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4">our subscription cancelling FAQ</a>.</p>
      <p>Please reply to this email if you have any questions.
      <p>The Dust team</p>`,
  };
  return await sendEmail(email, cancelMessage);
}

void main().then(() => {
  console.log("DONE");
  process.exit(0);
});
