import type {
  AgentMessageType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  UserType,
} from "@dust-tt/types";
import { DustAPI, Err, Ok } from "@dust-tt/types";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { renderUserType } from "@app/lib/api/user";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { filterAndSortAgents } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function emailMatcher({
  senderEmail,
  targetEmail,
}: {
  senderEmail: string;
  targetEmail: string;
}): Promise<
  Result<
    {
      workspace: LightWorkspaceType;
      user: UserType;
      agentConfiguration: LightAgentConfigurationType;
    },
    Error
  >
> {
  // grab user
  const userModel = await User.findOne({
    where: { email: senderEmail },
  });

  if (!userModel) {
    logger.error(
      { senderEmail },
      "[emailMatcher] No user found with this email."
    );
    return new Err(new Error("No user found with this email."));
  }

  const user = renderUserType(userModel);

  // grab workspace
  const workspaceModel = await Workspace.findOne({
    include: [
      {
        model: MembershipModel,
        where: { userId: userModel.id },
      },
    ],
  });

  if (!workspaceModel) {
    logger.error(
      { senderEmail },
      "[emailMatcher] No workspace found for this user."
    );
    return new Err(new Error("No workspace found for this user."));
  }

  const workspace = renderLightWorkspaceType({ workspace: workspaceModel });

  // grab agent configuration
  const prodCredentials = await prodAPICredentialsForOwner(workspace);

  const dustAPI = new DustAPI(prodCredentials, logger);

  const agentConfigurationsRes = await dustAPI.getAgentConfigurations();
  if (agentConfigurationsRes.isErr()) {
    return new Err(new Error(agentConfigurationsRes.error.message));
  }
  const agentConfigurations = agentConfigurationsRes.value;

  const agentPrefix = targetEmail.split("@")[0];

  const matchingAgents = filterAndSortAgents(agentConfigurations, agentPrefix);
  if (matchingAgents.length === 0) {
    logger.error(
      { agentPrefix },
      "[emailMatcher] No agent configuration found for this email."
    );
    return new Err(new Error("No agent configuration found for this email."));
  }
  const agentConfiguration = matchingAgents[0];

  return new Ok({
    workspace,
    user,
    agentConfiguration,
  });
}

export async function emailAnswer({
  owner,
  user,
  agentConfiguration,
  threadTitle,
  threadContent,
}: {
  owner: LightWorkspaceType;
  user: UserType;
  agentConfiguration: LightAgentConfigurationType;
  threadTitle: string;
  threadContent: string;
}) {
  const localLogger = logger.child({});
  const prodCredentials = await prodAPICredentialsForOwner(owner);

  const dustAPI = new DustAPI(prodCredentials, localLogger, {
    useLocalInDev: true,
  });

  const convRes = await dustAPI.createConversation({
    title: `Email thread: ${threadTitle}`,
    visibility: "unlisted",
    message: {
      content: `:mention[${agentConfiguration.name}]{sId=${agentConfiguration.sId}}`,
      mentions: [{ configurationId: agentConfiguration.sId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePictureUrl: user.image,
      },
    },
    contentFragment: {
      title: `Email thread: ${threadTitle}`,
      content: threadContent,
      url: null,
      contentType: "file_attachment",
      context: {
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePictureUrl: user.image,
      },
    },
    blocking: true,
  });

  if (convRes.isErr()) {
    localLogger.error(
      { error: convRes.error },
      "[emailAnswer] Error creating conversation."
    );
    return new Err(new Error(convRes.error.message));
  }

  const { conversation } = convRes.value;
  if (!conversation) {
    localLogger.error("[emailAnswer] No conversation found. Stopping.");
    return;
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
    },
    "[emailAnswer] Created conversation."
  );

  // Get first from array with type='agent_message' in conversation.content;
  const agentMessage = <AgentMessageType[]>conversation.content.find(
    (innerArray) => {
      return innerArray.find((item) => item.type === "agent_message");
    }
  );

  const markDownAnswer =
    agentMessage && agentMessage[0].content ? agentMessage[0].content : "";
  const htmlAnswer = sanitizeHtml(await marked.parse(markDownAnswer), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]), // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
  });

  const msg = {
    from: {
      name: `${agentConfiguration.name} (Dust)`,
      email: `${agentConfiguration.name}@a.dust.tt`,
    },
    subject: threadTitle,
    html: `<a href="https://dust.tt/w/${owner.sId}/assistant/${conversation.sId}">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br /> ${agentConfiguration.name} at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}

async function send() {
  const msg = {
    from: {
      name: `TheInternalSpoofer`,
      email: `pr@dust.tt`,
    },
    subject: "Trying to spoof",
    html: `This is a test email to see if we spoof`,
  };

  await sendEmail("test@a.dust.tt", msg);

  const msg2 = {
    from: {
      name: `TheInternalSpoofer`,
      email: `spolu@proton.com`,
    },
    subject: "Trying to spoof",
    html: `This is a test email to see if we spoof`,
  };

  await sendEmail("test@a.dust.tt", msg2);
}

send()
  .then(() => {
    console.log("Email sent");
  })
  .catch((err) => {
    console.log("Error sending email", err);
  });
