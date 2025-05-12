import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { UniqueConstraintError } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  createConversation,
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import mainLogger from "@app/logger/logger";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";
import {
  retrieveGongTranscriptContent,
  retrieveGongTranscripts,
} from "@app/temporal/labs/transcripts/utils/gong";
import {
  retrieveGoogleTranscriptContent,
  retrieveGoogleTranscripts,
} from "@app/temporal/labs/transcripts/utils/google";
import {
  retrieveModjoTranscriptContent,
  retrieveModjoTranscripts,
} from "@app/temporal/labs/transcripts/utils/modjo";
import type { AgentMessageType, ModelId } from "@app/types";
import {
  assertNever,
  dustManagedCredentials,
  isEmptyString,
  isProviderWithDefaultWorkspaceConfiguration,
} from "@app/types";
import { Err } from "@app/types";
import { CoreAPI } from "@app/types";

export async function retrieveNewTranscriptsActivity(
  transcriptsConfigurationId: ModelId
): Promise<string[]> {
  const localLogger = mainLogger.child({
    transcriptsConfigurationId,
  });

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchByModelId(
      transcriptsConfigurationId
    );

  if (!transcriptsConfiguration) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Transcript configuration not found. Skipping."
    );
    return [];
  }

  const workspace = await Workspace.findOne({
    where: {
      id: transcriptsConfiguration.workspaceId,
    },
  });

  if (!workspace) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  if (!auth.workspace()) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Workspace not found. Stopping."
    );
    return [];
  }

  const transcriptsIdsToProcess: string[] = [];

  switch (transcriptsConfiguration.provider) {
    case "google_drive":
      const googleTranscriptsRes = await retrieveGoogleTranscripts(
        auth,
        transcriptsConfiguration,
        localLogger
      );
      if (googleTranscriptsRes.isErr()) {
        await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
        await transcriptsConfiguration.setIsActive(false);
        throw googleTranscriptsRes.error;
      }
      const googleTranscriptsIds = googleTranscriptsRes.value;
      transcriptsIdsToProcess.push(...googleTranscriptsIds);
      break;

    case "gong":
      const gongTranscriptsIds = await retrieveGongTranscripts(
        auth,
        transcriptsConfiguration,
        localLogger
      );
      transcriptsIdsToProcess.push(...gongTranscriptsIds);
      break;

    case "modjo":
      const modjoTranscriptsIds = await retrieveModjoTranscripts(
        auth,
        transcriptsConfiguration,
        localLogger
      );
      transcriptsIdsToProcess.push(...modjoTranscriptsIds);
      break;

    default:
      assertNever(transcriptsConfiguration.provider);
  }

  return transcriptsIdsToProcess;
}

export async function processTranscriptActivity(
  transcriptsConfigurationId: ModelId,
  fileId: string
) {
  function convertCitationsToLinks(
    markdown: string,
    conversationData: any
  ): string {
    if (typeof markdown !== "string") {
      localLogger.error(
        {
          markdown,
        },
        "Invalid markdown input."
      );
      return "";
    }

    let citationCount = 0;
    const citations: { [key: string]: number } = {};

    markdown.replace(/:cite\[([^\]]+)\]/g, (match, reference) => {
      if (!citations[reference]) {
        citationCount++;
        citations[reference] = citationCount;
      }
      return match;
    });

    const getSourceUrlFromReference = (reference: string): string => {
      if (!conversationData) {
        localLogger.warn("No conversation data available");
        return "#";
      }

      try {
        const document =
          conversationData.content[1][0].actions[0].documents.find(
            (doc: any) => doc.reference === reference
          );
        return document ? document.sourceUrl : "#";
      } catch (error) {
        localLogger.error(
          {
            error,
          },
          "Error finding source URL for reference."
        );
        return "#";
      }
    };

    return markdown.replace(/:cite\[([^\]]+)\]/g, (match, reference) => {
      const sourceUrl = getSourceUrlFromReference(reference);
      return `<a href="${sourceUrl}">[${citations[reference]}]</a>`;
    });
  }

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchByModelId(
      transcriptsConfigurationId
    );

  if (!transcriptsConfiguration) {
    throw new Error(
      `Could not find transcript configuration for id ${transcriptsConfigurationId}.`
    );
  }

  const workspace = await Workspace.findOne({
    where: {
      id: transcriptsConfiguration.workspaceId,
    },
  });

  if (!workspace) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  const user = await UserResource.fetchByModelId(
    transcriptsConfiguration.userId
  );

  if (!user) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(
      `Could not find user for id ${transcriptsConfiguration.userId}.`
    );
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const owner = auth.workspace();
  if (!owner) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(
      `Could not find workspace for user (workspaceId: ${transcriptsConfiguration.workspaceId}).`
    );
  }

  if (!auth.user() || !auth.isUser()) {
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(
      `Could not find user for id ${transcriptsConfiguration.userId}.`
    );
  }

  const localLogger = mainLogger.child({
    fileId,
    transcriptsConfigurationId,
    type: "transcript",
    userId: user.id,
    workspaceId: workspace.sId,
  });

  localLogger.info(
    {},
    "[processTranscriptActivity] Starting processing of file."
  );

  const hasExistingHistory =
    await transcriptsConfiguration.fetchHistoryForFileId(auth, fileId);
  if (hasExistingHistory) {
    localLogger.info(
      {},
      "[processTranscriptActivity] History record already exists. Stopping."
    );
    return;
  }

  let transcriptTitle = "";
  let transcriptContent = "";
  let userParticipated = true;
  let fileContentIsAccessible = true;

  localLogger.info(
    {},
    "[processTranscriptActivity] No history found. Proceeding."
  );

  switch (transcriptsConfiguration.provider) {
    case "google_drive":
      const googleResult = await retrieveGoogleTranscriptContent(
        auth,
        transcriptsConfiguration,
        fileId,
        localLogger
      );
      transcriptTitle = googleResult.transcriptTitle;
      transcriptContent = googleResult.transcriptContent;
      fileContentIsAccessible = googleResult.fileContentIsAccessible;
      break;

    case "gong":
      const gongResult = await retrieveGongTranscriptContent(
        auth,
        transcriptsConfiguration,
        fileId,
        localLogger
      );
      if (!gongResult) {
        localLogger.info(
          {
            fileId,
          },
          "[processTranscriptActivity] No Gong result found. Stopping."
        );
        return;
      }
      transcriptTitle = gongResult.transcriptTitle || "";
      transcriptContent = gongResult.transcriptContent || "";
      userParticipated = gongResult.userParticipated;
      break;

    case "modjo":
      const modjoResult = await retrieveModjoTranscriptContent(
        auth,
        transcriptsConfiguration,
        fileId,
        localLogger
      );
      if (!modjoResult) {
        localLogger.info(
          {
            fileId,
          },
          "[processTranscriptActivity] No Gong result found. Stopping."
        );
        return;
      }
      transcriptTitle = modjoResult.transcriptTitle || "";
      transcriptContent = modjoResult.transcriptContent || "";
      userParticipated = modjoResult.userParticipated;
      break;

    default:
      assertNever(transcriptsConfiguration.provider);
  }

  if (!fileContentIsAccessible) {
    localLogger.info(
      {},
      "[processTranscriptActivity] File content is not accessible. Stopping."
    );
    return;
  }

  try {
    await transcriptsConfiguration.recordHistory({
      configurationId: transcriptsConfiguration.id,
      fileId,
      fileName: transcriptTitle.substring(0, 255),
      workspaceId: owner.id,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      localLogger.info(
        {},
        "[processTranscriptActivity] History record already exists. Stopping."
      );
      return;
    }
    throw error;
  }

  let fullStorageDataSourceViewId = null;
  const fullStorage = isProviderWithDefaultWorkspaceConfiguration(
    transcriptsConfiguration.provider
  );

  if (fullStorage) {
    const defaultTranscriptsStorageConfiguration =
      await LabsTranscriptsConfigurationResource.fetchDefaultConfigurationForWorkspace(
        auth.getNonNullableWorkspace()
      );

    fullStorageDataSourceViewId =
      defaultTranscriptsStorageConfiguration?.dataSourceViewId;
  }

  // Decide to store transcript or not (user might not have participated)
  const shouldStoreTranscript =
    (userParticipated && !!transcriptsConfiguration.dataSourceViewId) ||
    (fullStorage && !!fullStorageDataSourceViewId);

  // Decide to process transcript or not (user needs to have participated)
  const shouldProcessTranscript =
    transcriptsConfiguration.isActive && userParticipated;

  localLogger.info(
    {
      fileId,
      userParticipated,
      transcriptsConfigurationDataSourceViewId:
        transcriptsConfiguration.dataSourceViewId,
      fullStorage,
      fullStorageDataSourceViewId,
      shouldStoreTranscript,
      shouldProcessTranscript,
    },
    "[processTranscriptActivity] Deciding to store and/or process transcript."
  );

  if (shouldStoreTranscript) {
    localLogger.info(
      {
        dataSourceViewId: transcriptsConfiguration.dataSourceViewId,
        fullStorage,
        fullStorageDataSourceViewId,
        transcriptsConfiguration,
        transcriptTitle,
        transcriptContentLength: transcriptContent.length,
      },
      "[processTranscriptActivity] Storing transcript to Datasource."
    );

    const dataSourceViewId =
      fullStorageDataSourceViewId || transcriptsConfiguration.dataSourceViewId;

    if (!dataSourceViewId) {
      localLogger.error(
        {},
        "[processTranscriptActivity] No datasource view id found. Stopping."
      );
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      return;
    }

    localLogger.info(
      {
        datasourceViewId: transcriptsConfiguration.dataSourceViewId,
      },
      "[processTranscriptActivity] Storing transcript to Datasource."
    );

    const [datasourceView] = await DataSourceViewResource.fetchByModelIds(
      auth,
      [dataSourceViewId]
    );

    if (!datasourceView) {
      localLogger.error(
        {},
        "[processTranscriptActivity] No datasource view found. Stopping."
      );
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      return;
    }

    const dataSource = datasourceView.dataSource;

    if (!dataSource) {
      localLogger.error(
        {},
        "[processTranscriptActivity] No datasource found. Stopping."
      );
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      return;
    }

    const credentials = dustManagedCredentials();

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);
    const upsertRes = await coreAPI.upsertDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: transcriptTitle,
      tags: ["transcript", transcriptsConfiguration.provider],
      parentId: null,
      parents: [transcriptTitle],
      sourceUrl: null,
      timestamp: null,
      section: {
        prefix: transcriptTitle,
        content: transcriptContent,
        sections: [],
      },
      credentials,
      lightDocumentOutput: true,
      title: transcriptTitle,
      mimeType: "text/plain",
    });

    if (upsertRes.isErr()) {
      localLogger.error(
        {
          dataSourceViewId: transcriptsConfiguration.dataSourceViewId,
          error: upsertRes.error,
        },
        "[processTranscriptActivity] Error storing transcript to Datasource. Keep going to process."
      );
    }

    await transcriptsConfiguration.setStorageStatusForFileId(auth, {
      fileId,
      stored: shouldStoreTranscript,
    });

    localLogger.info(
      {
        dataSourceViewId: transcriptsConfiguration.dataSourceViewId,
        transcriptTitle,
        transcriptContentLength: transcriptContent.length,
      },
      "[processTranscriptActivity] Stored transcript to Datasource."
    );
  }

  if (shouldProcessTranscript) {
    localLogger.info(
      {
        transcriptTitle,
        transcriptContentLength: transcriptContent.length,
      },
      "[processTranscriptActivity] Processing transcript content."
    );

    const { agentConfigurationId } = transcriptsConfiguration;

    if (!agentConfigurationId) {
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      localLogger.error(
        {},
        "[processTranscriptActivity] No agent configuration id found. Stopping."
      );
      return;
    }

    const agent = await getAgentConfiguration(
      auth,
      agentConfigurationId,
      "light"
    );

    if (!agent) {
      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      localLogger.error(
        {},
        "[processTranscriptActivity] Agent configuration not found. Stopping."
      );
      return;
    }

    if (isEmptyString(user.username)) {
      return new Err(new Error("username must be a non-empty string"));
    }

    const initialConversation = await createConversation(auth, {
      title: transcriptTitle,
      visibility: "workspace",
    });

    const baseContext = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: null,
    };

    const cfRes = await toFileContentFragment(auth, {
      contentFragment: {
        title: transcriptTitle,
        content: transcriptContent,
        contentType: "text/plain",
        url: null,
      },
      fileName: `${transcriptTitle}.txt`,
    });
    if (cfRes.isErr()) {
      localLogger.error(
        {
          conversationSid: initialConversation.sId,
          error: cfRes.error,
        },
        "[processTranscriptActivity] Error creating file for content fragment. Stopping."
      );
      return;
    }

    const contentFragmentRes = await postNewContentFragment(
      auth,
      initialConversation,
      cfRes.value,
      baseContext
    );

    if (contentFragmentRes.isErr()) {
      localLogger.error(
        {
          agentConfigurationId,
          conversationSid: initialConversation.sId,
          error: contentFragmentRes.error,
        },
        "[processTranscriptActivity] Error creating content fragment. Stopping."
      );
      return;
    }

    // Initial conversation is stale, so we need to reload it.
    const conversationRes = await getConversation(
      auth,
      initialConversation.sId
    );

    if (conversationRes.isErr()) {
      localLogger.error(
        {
          agentConfigurationId,
          conversationSid: initialConversation.sId,
          panic: true,
          error: conversationRes.error,
        },
        "[processTranscriptActivity] Unreachable: Error getting conversation after creation."
      );

      return;
    }

    let conversation = conversationRes.value;

    const messageRes = await postUserMessageWithPubSub(
      auth,
      {
        conversation,
        content: `Transcript: ${transcriptTitle}`,
        mentions: [{ configurationId: agentConfigurationId }],
        context: baseContext,
      },
      { resolveAfterFullGeneration: true }
    );

    if (messageRes.isErr()) {
      localLogger.error(
        {
          agentConfigurationId,
          conversationSid: conversation.sId,
          error: messageRes.error,
        },
        "[processTranscriptActivity] Error creating message. Stopping."
      );
      return;
    }

    const updatedRes = await getConversation(auth, conversation.sId);

    if (updatedRes.isErr()) {
      localLogger.error(
        {
          agentConfigurationId,
          conversationSid: conversation.sId,
          error: updatedRes.error,
        },
        "[processTranscriptActivity] Error getting conversation after creation. Stopping."
      );
      return;
    }

    conversation = updatedRes.value;

    localLogger.info(
      {
        agentConfigurationId,
        conservationSid: conversation.sId,
      },
      "[processTranscriptActivity] Created conversation."
    );

    // Get first from array with type='agent_message' in conversation.content;
    const agentMessage = <AgentMessageType[]>conversation.content.find(
      (innerArray) => {
        return innerArray.find((item) => item.type === "agent_message");
      }
    );

    // Usage
    const markDownAnswer =
      agentMessage && agentMessage[0].content
        ? convertCitationsToLinks(agentMessage[0].content, conversation)
        : "";

    const htmlAnswer = sanitizeHtml(await marked.parse(markDownAnswer), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]), // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
    });

    await transcriptsConfiguration.setConversationHistory(auth, {
      conversationId: conversation.sId,
      fileId,
    });

    await sendEmailWithTemplate({
      to: user.email,
      from: {
        name: "Dust team",
        email: "support@dust.help",
      },
      subject: `[DUST] Transcripts - ${transcriptTitle.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")}`,
      body: `${htmlAnswer}<div style="text-align: center; margin-top: 20px;">
    <a href="${config.getClientFacingUrl()}/w/${owner.sId}/assistant/${conversation.sId}"
      style="display: inline-block;
              padding: 10px 20px;
              background-color: #000000;
              color: #ffffff;
              text-decoration: none;
              border-radius: 0.75rem;
              font-weight: bold;">
      Open this conversation in Dust
    </a>
  </div>`,
    });

    localLogger.info(
      {
        agentConfigurationId,
        conversationSid: conversation.sId,
      },
      "[processTranscriptActivity] Sent processed transcript email."
    );
  }
}
