import type {
  AgentConfigurationType,
  AgentMessageType,
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
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function emailMatcher({
  senderEmail,
}: {
  senderEmail: string;
}): Promise<Result<{ workspace: LightWorkspaceType; user: UserType }, Error>> {
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

  return new Ok({
    workspace: renderLightWorkspaceType({ workspace: workspaceModel }),
    user: renderUserType(userModel),
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
  agentConfiguration: AgentConfigurationType;
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
    html: `<a href="https://dust.tt/w/${owner.sId}/assistant/${conversation.sId}">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br />The team at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}
