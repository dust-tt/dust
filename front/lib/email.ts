/**
 * This file contains functions related to sending emails, as well as the
 * content of emails themselves.
 */
import sgMail from "@sendgrid/mail";

import { XP1User } from "@app/lib/models";
import logger from "@app/logger/logger";

const { SENDGRID_API_KEY, XP1_CHROME_WEB_STORE_URL } = process.env;

if (!SENDGRID_API_KEY) {
  throw new Error("Missing SENDGRID_API_KEY env variable");
}
sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendEmail(email: string, message: any) {
  const msg = { ...message, to: email };
  try {
    await sgMail.send(msg);
    logger.info(
      { email, subject: message.subject },
      "Sending email to admin about subscription."
    );
  } catch (error) {
    logger.error(
      { error, email, subject: message.subject },
      "Error sending email."
    );
  }
}

export const sendActivationKey = async (user: XP1User) => {
  const msg = {
    to: user.email,
    from: "team@dust.tt",
    subject: "[DUST] XP1 Activation Key",
    text: `Welcome to XP1!

You activation key is: ${user.secret}

You will need it to activate XP1 once installed[0]. Don't hesitate to
respond to this email directly with any question, feature request, or
just to let us know how you save time with XP1.

Looking forward to hearing from you.

The Dust Team

[0] ${XP1_CHROME_WEB_STORE_URL}`,
  };

  await sgMail.send(msg);

  console.log("ACTIVATION KEY SENT", user.email);
};

export async function sendGithubDeletionEmail(email: string): Promise<void> {
  const cancelMessage = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Github connection deleted - important information`,
    html: `<p>Hello from Dust,</p>
    <p>Your Dust connection to Github was deleted, along with all the related data on Dust servers.</p>
    <p>You can now uninstall the Dust app from your Github account to revoke authorizations initially granted to Dust when you connected the Github account.</p>
    <p>Please reply to this email if you have any questions.</p>
    <p>The Dust team</p>`,
  };
  return sendEmail(email, cancelMessage);
}

/** Emails for cancelling / reactivating subscription */

export async function sendCancelSubscriptionEmail(
  email: string,
  workspaceSId: string,
  date: Date
): Promise<void> {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const formattedDate = date.toLocaleDateString("en-US", options);
  const cancelMessage = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Subscription canceled - important information`,
    html: `<p>Hello from Dust,</p>
    <p>You just canceled your subscription. It will be terminated at the end of your current billing period (${formattedDate}). You can reactivate your subscription at any time before then. If you do not reactivate your subscription, you will then be switched back to our free plan:</p>
    <ul>
    <li>all users will be removed from the workspace except for the most tenured admin (more about this <a href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4">here</a>);</li>
    <li>connections will be removed and data safety deleted from Dust;</li>
    <li>conversations, custom assistants, and data sources will still be accessible with limitations;</li>
    <li>your usage of Dust will have the <a href="https://dust.tt/w/${workspaceSId}/subscription">restrictions of the free plan</a>.</li>
    </ul>
    <p>More details are available on <a href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4">our subscription cancelling FAQ</a>.</p>
    <p>Please reply to this email if you have any questions.
    <p>The Dust team</p>`,
  };
  return sendEmail(email, cancelMessage);
}

export async function sendReactivateSubscriptionEmail(
  email: string
): Promise<void> {
  const reactivateMessage = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Your subscription has been reactivated`,
    html: `<p>You have requested to reactivate your subscription.</p> 
    <p>Therefore, your subscription will not be canceled at the end of the billing period, no downgrade actions will take place, and you can continue using Dust as usual.</p>
    <p>We really appreciate you renewing your trust in us.</p>
    <p>If you have any questions, we'll gladly answer at team@dust.tt.</p>
    <p>Best,</p>
    <p>The Dust team</p>`,
  };
  return sendEmail(email, reactivateMessage);
}

export async function sendOpsEmail(workspaceSId: string): Promise<void> {
  const opsMessage = {
    from: {
      name: "System",
      email: "ops@dust.tt",
    },
    subject: `[OPS - Eng runner] A subscription has been canceled`,
    html: `<p>Hi Dust ops,</p> 
    <p>The subscription of workspace '${workspaceSId}' was just canceled. Go to the <a href="https://dust.tt/poke/${workspaceSId}">Poke Page</a> and follow the <a href="https://www.notion.so/dust-tt/Runbook-Canceled-subscription-0011ab1afebe467b871b25f572b56a9e?pvs=4">Runbook</a> for when a subscription is cancelled</p>
    <p>We'll automate this soon. Just doing that to be extra sure for the ~10 first downgrades.</p>
    <p>Sincerely,
    <p>Ourselves</p>`,
  };
  return sendEmail("ops@dust.tt", opsMessage);
}
