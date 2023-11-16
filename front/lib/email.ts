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

async function sendEmail(email: string, message: any) {
  const msg = { ...message, to: email };
  try {
    await sgMail.send(msg);
    logger.info(
      { email, subject: message.subject },
      "Sending email to admin about subscription."
    );
  } catch (error) {
    logger.error(
      { error, email },
      "Error sending email to admin about subscription cancellation."
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

/** Emails for cancelling / reactivating subscription */

export async function sendCancelSubscriptionEmail(
  email: string,
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
    subject: `[Dust] Your subscription has been canceled; important information`,
    text: `<p>You have requested to cancel your subscription</p> 
    <p>Your subscription will end at the end of your current billing period (${formattedDate}). You can reactivate your subscription at any time before then. If you do not reactivate your subscription, you will be switched back to our free plan at the end of the current billing period.</p>
    <p>This will have the following consequences:</p>
    <ul>
    <li>all users except one will be removed from your workspace;</li>
    <li>your connections will be deleted</li>
    <li>the rest of your data (conversations, custom assistants, custom datasource) will still be accessible but with multiple limitations.</li>
    <li>you will be subjected to the <a href="https://dust.tt/#sectionPricing">restrictions of the free plan</a></li>
    </ul>
    <p>Complete details as to what will happen are available at <a href="https://dust-tt.notion.site/What-happens-when-we-cancel-our-Dust-subscription-59aad3866dcc4bbdb26a54e1ce0d848a?pvs=4">subscription cancelling FAQ</a>.</p>
    <p>If you have any questions, please contact us at team@dust.tt.</p>
    <p>Best,</p>
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
    text: `<p>You have requested to reactivate your subscription.</p> 
    <p>Therefore, your subscription will not be canceled at the end of the billing period, no downgrade actions will take place, and you can continue using Dust as usual.</p>
    <p>We really appreciate you renewing your trust in us.</p>
    <p>If you have any questions, we'll gladly answer at team@dust.tt.</p>
    <p>Best,</p>
    <p>The Dust team</p>`,
  };
  return sendEmail(email, reactivateMessage);
}
