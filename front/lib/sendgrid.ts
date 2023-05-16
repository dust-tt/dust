import sgMail from "@sendgrid/mail";

import { XP1User } from "@app/lib/models";

const { SENDGRID_API_KEY, XP1_CHROME_WEB_STORE_URL } = process.env;

export const sendActivationKey = async (user: XP1User) => {
  if (!SENDGRID_API_KEY) {
    throw new Error("Missing SENDGRID_API_KEY env variable");
  }
  sgMail.setApiKey(SENDGRID_API_KEY);
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
