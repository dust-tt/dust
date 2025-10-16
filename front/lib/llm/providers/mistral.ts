import { Mistral } from '@mistralai/mistralai';
import type { AssistantMessage } from '@mistralai/mistralai/models/components/assistantmessage';
import type { ContentChunk } from '@mistralai/mistralai/models/components/contentchunk';
import type { SystemMessage } from '@mistralai/mistralai/models/components/systemmessage';
import type { ToolMessage } from '@mistralai/mistralai/models/components/toolmessage';
import type { UserMessage } from '@mistralai/mistralai/models/components/usermessage';

import { LLM } from "@app/lib/llm/llm";
import type { LLMStreamEvent, ProviderMetadata} from "@app/lib/llm/types";
import type { RenderedModelConversationTypeMultiActions } from "@app/types";
import { dustManagedCredentials } from "@app/types/api/credentials";


type MistralMessage = (SystemMessage & { role: "system" })
    | (ToolMessage & { role: "tool" })
    | (UserMessage & { role: "user" })
    | (AssistantMessage & { role: "assistant" });

export class MistralLLM extends LLM {
    private client: Mistral;
    private baseMetadata: ProviderMetadata<"mistral"> = {
        provider: "mistral",
        model: this.modelId,
        metadata: {},
    };
    constructor({ temperature, modelId }: { temperature: number, modelId: string}) {
        super({ temperature, modelId, providerId: "mistral" });
        const { MISTRAL_API_KEY } = dustManagedCredentials();
        this.client = new Mistral({
            apiKey: MISTRAL_API_KEY,
        });
    }

    async *stream({
        conversation,
        prompt
    }: {
        conversation: RenderedModelConversationTypeMultiActions;
        prompt: string;
    }): AsyncGenerator<LLMStreamEvent> {
        const mistralConversation = this.toMistralConversation({
            conversation,
            prompt,
        });
        const eventStream = await this.client.chat.stream({
            model: this.modelId,
            messages: mistralConversation,
            temperature: this.temperature,
            stream: true,
        });
        for await (const event of eventStream) {
            const chunk = event.data.choices[0].delta;
            if (chunk.content && !chunk.toolCalls) {
                if (typeof chunk.content === 'string') {
                    yield {
                        type: "text_delta",
                        delta: chunk.content,
                        metadata: this.baseMetadata,
                    };
                }
            } else {
                // Only handle text deltas for now
                continue;
            }
        }
    }

    private toMistralConversation({
        conversation,
        prompt
    }: {
        conversation: RenderedModelConversationTypeMultiActions;
        prompt: string;
    }): MistralMessage[] {
        const mistralConversation: MistralMessage[] = conversation.messages.filter(message => message.content).map(message => {
            let content: string | ContentChunk[];
            if (typeof message.content === 'string') {
                content = message.content;
            } else {
                content = message.content!.map(content => {
                    switch (content.type) {
                        case 'text':
                            return {
                                type: 'text',
                                text: content.text,
                            };
                        case 'image_url':
                            return {
                                type: 'image_url',
                                imageUrl: content.image_url.url,
                            };
                    }
                });
            }
            return {
                role: message.role === "function" ? "tool" : message.role,
                content: content,
            };
        });
        return [{
            role: "system",
            content: prompt,
        }, ...mistralConversation];
    }
}