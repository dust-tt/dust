import type { ResponseInput, ResponseInputContent, ResponseInputItem, ResponseInputMessageContentList, ResponseOutputMessage } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";

import type { AssistantContentMessageTypeModel, Content, ModelMessageTypeMultiActionsWithoutContentFragment as Message, UserMessageTypeModel } from "@app/types";
import type { AgentReasoningEffort, ModelConversationTypeMultiActions } from "@app/types";
import { isString } from "@app/types";

export function toOpenAIReasoningEffort(reasoningEffort: AgentReasoningEffort): ReasoningEffort | null {
    return reasoningEffort === "none" 
    ? null 
    : reasoningEffort === "light" ? "low" : reasoningEffort;
}

function contentToResponseInputContent(content: Content): ResponseInputContent {
    switch (content.type) {
        case "text":
            return { type: "input_text", text: content.text };
        case "image_url":
            return { type: "input_image", image_url: content.image_url.url, detail: "auto" };
    }
}

function contentListToResponseInputContentList(content: Content[]): ResponseInputContent[] {
    return content.map(contentToResponseInputContent);
}

function messageContentToResponseInputMessageContentList(content?: string | Content[]): ResponseInputMessageContentList {
    if (!content) {
        return [];
    }
    if (isString(content)) {
        return [{ type: "input_text", text: content }];
    }
    return contentListToResponseInputContentList(content);
}


function systemPrompt(prompt: string): ResponseInputItem.Message {
    return {
        role: "system",
        content: [{ type: "input_text", text: prompt }],
    };
}

function userMessage(message: UserMessageTypeModel): ResponseInputItem.Message {
    return {
        role: "user",
        content: messageContentToResponseInputMessageContentList(message.content),
    };
}

function assistantMessage(message: AssistantContentMessageTypeModel): ResponseInputItem {
    if (message.contents) {
        
    }
}

function messageToResponseInputMessage(message: Message): ResponseInputItem.Message {
    switch (message.role) {
        case "user":
            return userMessage(message);
        case "assistant":
            return assistantMessage(message);
        case "function":
            return functionMessage(message);
    }
}

export function toInput(prompt: string, conversation: ModelConversationTypeMultiActions): ResponseInput {
    const inputs: ResponseInput = [];
    inputs.push(systemPrompt(prompt));

    for (const message of conversation.messages) {

    }
    return inputs;
}