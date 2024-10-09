import type { PluginArgs } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";

const args: PluginArgs = {
  templateId: {
    type: "string",
    label: "Email Template ID",
    description: "The ID of the email template to use",
  },
  sendCopy: {
    type: "boolean",
    label: "Send Copy to Admin",
    description: "Whether to send a copy of the email to the admin",
  },
};

export const sendWelcomeEmail = createPlugin(
  {
    id: "send-welcome-email",
    title: "Send Welcome Email",
    description: "Sends a welcome email to a new user",
    resourceTypes: ["memberships"],
    args,
  },
  async (auth, resourceId, args) => {
    console.log(
      `Sending welcome email to user ${resourceId} using template ${args.templateId}`
    );
    if (args.sendCopy) {
      console.log("Sending copy to admin");
    }

    return new Ok("Welcome email sent successfully");
  }
);
