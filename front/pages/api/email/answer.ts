import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  AgentConfigurationType,
  AgentMessageType,
  DustAPI,
  Err,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export async function emailAnswer({
  owner,
  user,
  agentConfiguration,
  threadTitle,
  threadContent,
}: {
  owner: WorkspaceType;
  user: UserType;
  agentConfiguration: AgentConfigurationType;
  threadTitle: string;
  threadContent: string;
}) {
  const localLogger = logger.child({});
  const prodCredentials = await prodAPICredentialsForOwner(
    renderLightWorkspaceType({ workspace: owner })
  );

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
      name: "Dust team",
      email: "team@dust.tt",
    },
    subject: threadTitle,
    html: `<a href="https://dust.tt/w/${owner.sId}/assistant/${conversation.sId}">Open this conversation in Dust</a><br /><br /> ${htmlAnswer}<br /><br />The team at <a href="https://dust.tt">Dust.tt</a>`,
  };

  await sendEmail(user.email, msg);
}
