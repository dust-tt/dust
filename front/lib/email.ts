/**
 * This file contains functions related to sending emails, as well as the
 * content of emails themselves.
 */
import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";

const { SENDGRID_API_KEY = "" } = process.env;

sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendEmail(email: string, message: any) {
  const msg = { ...message, to: email };
  try {
    await sgMail.send(msg);
    logger.info({ email, subject: message.subject }, "Sending email");
  } catch (error) {
    logger.error(
      { error, email, subject: message.subject },
      "Error sending email."
    );
  }
}

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
    <li>all users will be removed from the workspace except for the most tenured admin (more about this <a href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription">here</a>);</li>
    <li>connections will be removed and data safety deleted from Dust;</li>
    <li>conversations, custom assistants, and data sources will still be accessible with limitations;</li>
    <li>your usage of Dust will have the <a href="https://dust.tt/w/${workspaceSId}/subscription">restrictions of the free plan</a>.</li>
    </ul>
    <p>Also note that if you have a data source (folder) with more than 50 MB of data, it will be deleted after the end of your billing period. </p>
    <p>More details are available on <a href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription">our subscription cancelling FAQ</a>.</p>
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
    <p>If you have any questions, we'll gladly answer at support@dust.tt.</p>
    <p>Best,</p>
    <p>The Dust team</p>`,
  };
  return sendEmail(email, reactivateMessage);
}

export async function sendOpsDowngradeTooMuchDataEmail(
  workspaceSId: string,
  datasourcesTooBig: string[]
): Promise<void> {
  const opsMessage = {
    from: {
      name: "System",
      email: "ops@dust.tt",
    },
    subject: `[OPS - Eng runner] A subscription has been canceled`,
    html: `<p>Hi Dust ops,</p>
    <p>The subscription of workspace '${workspaceSId}' was just canceled. They have datasource(s) with more than 50MB data: ${datasourcesTooBig.join(
      ", "
    )}</p>
    Go to the <a href="https://dust.tt/poke/${workspaceSId}">Poke Page</a> and follow the <a href="https://www.notion.so/dust-tt/Runbook-Canceled-subscription-0011ab1afebe467b871b25f572b56a9e?pvs=4">Runbook</a></p>
    <p>Sincerely,
    <p>Ourselves</p>`,
  };
  return sendEmail("ops@dust.tt", opsMessage);
}

export async function sendAdminDowngradeTooMuchDataEmail(
  email: string,
  datasourcesTooBig: string[]
): Promise<void> {
  const message = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Your subscription has ended - important information`,
    html: `<p>Hello from Dust,</p>
    <p>Your paying subsciption has ended. While you can still access Dust as a free user, the following datasources will be deleted in 7 days because they contain more than 50MB of data: ${datasourcesTooBig.join(
      ", "
    )}.</p>
    <p>If they contain any valuable data, please back them up before then.</p>
    <p>Reply to this email if you have any questions.</p>
    <p>Best,
    <p>The Dust team</p>`,
  };
  return sendEmail(email, message);
}

export async function sendAdminSubscriptionPaymentFailedEmail(
  email: string,
  customerPortailUrl: string | null
): Promise<void> {
  const message = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `[Dust] Your payment has failed`,
    html: `<p>Hello from Dust,</p>
    <p>Your payment has failed. Please visit ${customerPortailUrl} to edit your payment information.</p>
    <p>
      Please note: your workspace will be downgraded after 3 failed payment retries. This will trigger the removal of any feature attached to the paid plan you were on, and the permanent deletion of connections and the data associated with them. Any assistant that are linked to connections will also be removed.
    </p>
    <p>Please reply to this email if you have any questions.</p>
    <br />
    <p>The Dust team</p>`,
  };
  return sendEmail(email, message);
}

export async function sendAdminDataDeletionEmail({
  email,
  firstName,
  workspaceName,
  remainingDays,
  isLast,
}: {
  email: string;
  firstName: string;
  workspaceName: string;
  remainingDays: number;
  isLast: boolean;
}): Promise<void> {
  const msg = {
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: `${
      isLast ? "Last Reminder: " : ""
    }Your Dust data will be deleted in ${remainingDays} days`,
    html: `<p>Hello ${firstName},</p>
    <p>You're receiving this as Admin of the Dust workspace ${workspaceName}. You recently canceled your Dust subscription.</p>
    <p>To protect your privacy and maintain the highest security standards, your data will be permanently deleted in ${remainingDays} days. Please note that once deleted, the data cannot be recovered.</p>
    <p>If you have any question about Dust, or would like to recover your account, simply reply to this email.</p>
    ${isLast ? "<p>This is our last message before data deletion.</p>" : ""}
    <p>Best,</p>
    <p>The Dust team</p>`,
  };
  return sendEmail(email, msg);
}

export async function sendProactiveTrialCancelledEmail(
  email: string
): Promise<void> {
  const message = {
    from: {
      name: "Gabriel Hubert",
      email: "gabriel@dust.tt",
    },
    subject: "[Dust] Your Pro plan trial has been cancelled early",
    html: `<p>Hi,</p>

    <p>I'm Gabriel, a cofounder of Dust. Thanks for trying us out with a free trial of the Pro Plan.</p>

    <p>You've not used core features of the product (adding data sources, creating custom assistants) and you haven't used assistant conversations in the past 7 days.
    As a result, to avoid keeping your payment method on file while you may not intend to convert to our paid plan, we've cancelled your trial ahead of time and won't be charging you.</p>

    <p>If you did intend to continue on Dust, you can subscribe again. If you'd like to extend further, feel free to just email me.</p>

    <p>Thanks again for trying Dust out. If you have a second, please let me know if you have any thoughts about what we could do to improve Dust for your needs!</p>

    Gabriel`,
  };

  return sendEmail(email, message);
}

export async function sendEmailWithTemplate(
  to: string,
  from: { name: string; email: string },
  subject: string,
  body: string
): Promise<Result<void, Error>> {
  const templateId = config.getGenericEmailTemplate();
  const message = {
    to,
    from,
    templateId,
    dynamic_template_data: {
      subject,
      body,
    },
  };

  try {
    await sendEmail(to, message);
    logger.info({ email: to, subject }, "Sending email");
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
    return new Err(e as Error);
  }
}
