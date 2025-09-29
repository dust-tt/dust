/**
 * This file contains functions related to sending emails, as well as the
 * content of emails themselves.
 */
import sgMail from "@sendgrid/mail";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isDevelopment, normalizeError, Ok } from "@app/types";

let sgMailClient: sgMail.MailService | null = null;

function getSgMailClient(): any {
  if (!sgMailClient) {
    sgMail.setApiKey(config.getSendgridApiKey());
    sgMailClient = sgMail;
  }

  return sgMail;
}

export async function sendGitHubDeletionEmail(email: string): Promise<void> {
  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Dust team",
      email: "support@dust.help",
    },
    subject: "[Dust] GitHub connection deleted - important information",
    body: `<p>Your Dust connection to GitHub was deleted, along with all the related data on Dust servers.</p>
    <p>You can now uninstall the Dust app from your GitHub account to revoke authorizations initially granted to Dust when you connected the GitHub account.</p>
    <p>Please reply to this email if you have any questions.</p>`,
  });
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

  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Dust team",
      email: "support@dust.help",
    },
    subject: `[Dust] Subscription canceled - important information`,
    body: `
      <p>You just canceled your subscription. It will be terminated at the end of your current billing period (${formattedDate}). You can reactivate your subscription at any time before then. If you do not reactivate your subscription, you will then be switched back to our free plan:</p>
      <ul>
      <li>all users will be removed from the workspace except for the most tenured admin (more about this <a href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription">here</a>);</li>
      <li>connections will be removed and data safety deleted from Dust;</li>
      <li>conversations, custom agents, and data sources will still be accessible with limitations;</li>
      <li>your usage of Dust will have the <a href="https://dust.tt/w/${workspaceSId}/subscription">restrictions of the free plan</a>.</li>
      </ul>
      <p>Also note that if you have a data source (folder) with more than 50 MB of data, it will be deleted after the end of your billing period. </p>
      <p>More details are available on <a href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription">our subscription cancelling FAQ</a>.</p>
      <p>Please reply to this email if you have any questions.`,
  });
}

export async function sendReactivateSubscriptionEmail(
  email: string
): Promise<void> {
  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Dust team",
      email: "support@dust.help",
    },
    subject: `[Dust] Your subscription has been reactivated`,
    body: `<p>You have requested to reactivate your subscription.</p>
      <p>Therefore, your subscription will not be canceled at the end of the billing period, no downgrade actions will take place, and you can continue using Dust as usual.</p>
      <p>We really appreciate you renewing your trust in us.</p>
      <p>If you have any questions, we'll gladly answer at support@dust.tt.</p>`,
  });
}

export async function sendAdminSubscriptionPaymentFailedEmail(
  email: string,
  customerPortailUrl: string | null
): Promise<void> {
  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Dust team",
      email: "support@dust.help",
    },
    subject: `[Dust] Your payment has failed`,
    body: `
      <p>Your payment has failed. Please visit ${customerPortailUrl} to edit your payment information.</p>
      <p>
        Please note: your workspace will be downgraded after 3 failed payment retries. This will trigger the removal of any feature attached to the paid plan you were on, and the permanent deletion of connections and the data associated with them. Any agent that are linked to connections will also be removed.
      </p>
      <p>Please reply to this email if you have any questions.</p>`,
  });
}

export async function sendAdminDataDeletionEmail({
  email,
  workspaceName,
  remainingDays,
  isLast,
}: {
  email: string;
  workspaceName: string;
  remainingDays: number;
  isLast: boolean;
}): Promise<void> {
  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Dust team",
      email: "support@dust.help",
    },
    subject: `${
      isLast ? "Last Reminder: " : ""
    }Your Dust data will be deleted in ${remainingDays} days`,
    body: `
      <p>You're receiving this as Admin of the Dust workspace ${workspaceName}. You recently canceled your Dust subscription.</p>
      <p>To protect your privacy and maintain the highest security standards, your data will be permanently deleted in ${remainingDays} days.</p>
      <p>To keep your data, please resubscribe within the next ${remainingDays} days to recover your account. After this period, data recovery will not be possible.</p>
      <p>If you have any question about Dust, simply reply to this email.</p>
      ${isLast ? "<p>This is our last message before data deletion.</p>" : ""}`,
  });
}

export async function sendProactiveTrialCancelledEmail(
  email: string
): Promise<void> {
  await sendEmailWithTemplate({
    to: email,
    from: {
      name: "Gabriel Hubert",
      email: "gabriel@dust.tt",
    },
    subject: "[Dust] Your Pro plan trial has been cancelled early",
    body: `
      <p>I'm Gabriel, a cofounder of Dust. Thanks for trying us out with a free trial of the Pro Plan.</p>

      <p>You've not used core features of the product (adding data sources, creating custom agents) and you haven't used agent conversations in the past 7 days.
      As a result, to avoid keeping your payment method on file while you may not intend to convert to our paid plan, we've cancelled your trial ahead of time and won't be charging you.</p>

      <p>If you did intend to continue on Dust, you can subscribe again. If you'd like to extend further, feel free to just email me.</p>

      <p>Thanks again for trying Dust out. If you have a second, please let me know if you have any thoughts about what we could do to improve Dust for your needs!</p>`,
  });
}

// Avoid using this function directly, use sendEmailWithTemplate instead.
export async function sendEmail(email: string, message: any) {
  const msg = { ...message, to: email };

  // In dev we want to make sure we don't send emails to real users.
  // We prevent sending an email if it's not to a @dust.tt address.
  if (isDevelopment() && !email.endsWith("@dust.tt")) {
    logger.error(
      { email, subject: message.subject },
      "Prevented sending email in development mode to an external email."
    );
    return;
  }

  try {
    await getSgMailClient().send(msg);
    logger.info({ email, subject: message.subject }, "Sending email");
  } catch (error) {
    logger.error(
      { error, email, subject: message.subject },
      "Error sending email."
    );
  }
}

interface sendEmailWithTemplateParams {
  to: string;
  from: {
    email: string;
    name: string;
  };
  replyTo?: string;
  subject: string;
  body: string;
}

// This function sends an email using a predefined template. Note: The salutation and footer are
// automatically included by the template, so do not add them manually to the email body.
export async function sendEmailWithTemplate({
  to,
  from,
  replyTo,
  subject,
  body,
}: sendEmailWithTemplateParams): Promise<Result<void, Error>> {
  const templateId = config.getGenericEmailTemplate();
  const message = {
    to,
    from,
    replyTo,
    templateId,
    dynamic_template_data: {
      subject,
      body,
    },
  };

  try {
    await sendEmail(to, message);
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        error: e,
        to,
        subject,
      },
      "Error sending email."
    );
    return new Err(normalizeError(e));
  }
}
