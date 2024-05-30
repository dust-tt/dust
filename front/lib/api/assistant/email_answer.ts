import type {
  AgentMessageType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import {
  createConversation,
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { renderUserType } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
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

  const auth = await Authenticator.internalUserForWorkspace({
    user,
    workspace,
  });

  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "list",
    variant: "light",
    limit: undefined,
    sort: undefined,
  });

  // grab agent configuration

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
  auth,
  agentConfiguration,
  threadTitle,
  threadContent,
}: {
  auth: Authenticator;
  agentConfiguration: LightAgentConfigurationType;
  threadTitle: string;
  threadContent: string;
}) {
  const localLogger = logger.child({});
  const user = auth.user();
  if (!user) {
    localLogger.error("[emailAnswer] No user found. Stopping.");
    return;
  }

  const initialConversation = await createConversation(auth, {
    title: `Email thread: ${threadTitle}`,
    visibility: "unlisted",
  });

  await postNewContentFragment(auth, {
    conversation: initialConversation,
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
  });

  const messageRes = await postUserMessageWithPubSub(
    auth,
    {
      conversation: initialConversation,
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
    { resolveAfterFullGeneration: true }
  );

  if (messageRes.isErr()) {
    return new Err(new Error(messageRes.error.api_error.message));
  }

  const conversation = await getConversation(auth, initialConversation.sId);

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
      name: `${agentConfiguration.name} (No reply - Dust)`,
      email: `noreply@dust.tt`,
    },
    subject: threadTitle,
    html: `<a href="https://dust.tt/w/${auth.workspace()?.sId}/assistant/${
      conversation.sId
    }">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br /> ${
      agentConfiguration.name
    } at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}
