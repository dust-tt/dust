import _ from "lodash";
import { Op, UniqueConstraintError } from "sequelize";

import {
  ConversationModel,
  ConversationParticipantModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const CHUNK_SIZE = 1000;
const CONVERSATION_CONCURRENCY = 5;
/**
 * Find all conversations in the workspace that have missing participants and process them.
 * @param workspaceId - The workspace model ID to process. Not the sId.
 * @param execute - Whether to execute the migration.
 */
async function processConversationsWithMissingParticipants(
  workspaceId: number,
  execute: boolean
) {
  // Find all conversations in the workspace that have missing participants.
  const conversationsWithMissingParticipants = await ConversationModel.findAll({
    where: {
      workspaceId,
      id: {
        [Op.notIn]: frontSequelize.literal(
          `(SELECT DISTINCT "conversationId" FROM conversation_participants WHERE "workspaceId" = ${workspaceId})`
        ),
      },
    },
  });
  console.log(
    `Found ${conversationsWithMissingParticipants.length} conversations with missing participants.`
  );

  // Process by chunks to avoid memory issues.
  const conversationChunks = _.chunk(
    conversationsWithMissingParticipants,
    CHUNK_SIZE
  );
  for (const conversations of conversationChunks) {
    await processChunk(conversations, workspaceId, execute);
  }
}

/**
 * Process a chunk of conversations.
 * @param conversations - The conversations to process.
 * @param workspaceId - The workspace ID to process.
 * @param execute - Whether to execute the migration.
 */
async function processChunk(
  conversations: ConversationModel[],
  workspaceId: number,
  execute: boolean
) {
  await concurrentExecutor(
    conversations,
    async (conversation) => {
      await processConversation(conversation, workspaceId, execute);
    },
    { concurrency: CONVERSATION_CONCURRENCY }
  );
}

/**
 * Process a single conversation.
 * @param conversation - The conversation to process.
 * @param workspaceId - The workspace ID to process.
 * @param execute - Whether to execute the migration.
 */
async function processConversation(
  conversation: ConversationModel,
  workspaceId: number,
  execute: boolean
) {
  // Getting all the user messages in the conversation.
  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      userMessageId: {
        [Op.not]: null,
      },
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        attributes: ["userId", "createdAt"],
        order: [["createdAt", "DESC"]],
      },
    ],
  });

  // Looping through the messages and getting the last message by user ID.
  const lastMessageByUserId: { [key: number]: Date } = {};
  for (const message of messages) {
    const userId = message.userMessage?.userId;
    if (!userId) {
      logger.warn(
        `Message ${message.id} has no user ID. Should not happen.Skipping.`
      );
      continue;
    }
    if (
      !lastMessageByUserId[userId] ||
      lastMessageByUserId[userId] < message.createdAt
    ) {
      lastMessageByUserId[userId] = message.createdAt;
    }
  }

  // Looping through the last message by user ID and adding the participant to the conversation.
  for (const userId in lastMessageByUserId) {
    if (execute) {
      try {
        await ConversationParticipantModel.create({
          conversationId: conversation.id,
          workspaceId,
          userId: parseInt(userId),
          createdAt: lastMessageByUserId[userId],
          updatedAt: lastMessageByUserId[userId],
          action: "posted",
        });
        logger.info(
          `Created participant for user ${userId} in conversation ${conversation.sId}.`
        );
      } catch (err) {
        // Ignore duplicate key errors (participant might already exist)
        if (err instanceof UniqueConstraintError) {
          logger.info(
            `Participant ${userId} already exists in conversation ${conversation.sId}. Skipping.`
          );
        } else {
          logger.error(
            { error: err },
            `Failed to create participant for user ${userId} in conversation ${conversation.sId}.`
          );
        }
      }
    } else {
      logger.info(
        `Would create participant for user ${userId} in conversation ${conversation.sId}.`
      );
    }
  }
}

/**
 * Main function to run the migration.
 */
const worker = async ({
  execute,
  workspaceId,
}: {
  execute: boolean;
  workspaceId: number;
}) => {
  await processConversationsWithMissingParticipants(workspaceId, execute);
};

makeScript({ workspaceId: { type: "number" } }, worker);

export const up = worker;

export const down = async () => {
  logger.info("This migration cannot be reversed");
};
