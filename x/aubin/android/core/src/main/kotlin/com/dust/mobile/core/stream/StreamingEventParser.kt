package com.dust.mobile.core.stream

import com.dust.mobile.core.model.AgentActionSuccessEvent
import com.dust.mobile.core.model.AgentErrorEvent
import com.dust.mobile.core.model.AgentGenerationCancelledEvent
import com.dust.mobile.core.model.AgentMessageGracefullyStoppedEvent
import com.dust.mobile.core.model.AgentMessageNewEvent
import com.dust.mobile.core.model.AgentMessageDoneEventData
import com.dust.mobile.core.model.AgentMessageSuccessEvent
import com.dust.mobile.core.model.ConversationEventData
import com.dust.mobile.core.model.ConversationEventEnvelope
import com.dust.mobile.core.model.ConversationTitleEvent
import com.dust.mobile.core.model.GenerationTokensEvent
import com.dust.mobile.core.model.SSEEnvelope
import com.dust.mobile.core.model.StreamingEventData
import com.dust.mobile.core.model.ToolApproveExecutionEvent
import com.dust.mobile.core.model.ToolAskUserQuestionEvent
import com.dust.mobile.core.model.ToolErrorEvent
import com.dust.mobile.core.model.ToolFileAuthRequiredEvent
import com.dust.mobile.core.model.ToolNotificationEvent
import com.dust.mobile.core.model.ToolParamsEvent
import com.dust.mobile.core.model.ToolPersonalAuthRequiredEvent
import com.dust.mobile.core.model.UserMessageNewEvent
import com.dust.mobile.core.model.UserMessagePromotedEvent
import com.dust.mobile.core.model.requiredString
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject

object StreamingEventParser {
    fun parseMessageEvent(payload: String): SSEEnvelope {
        val obj = DustJson.parseToJsonElement(payload).jsonObject
        val data = obj.requiredDataObject()
        return SSEEnvelope(
            eventId = obj.requiredString("eventId"),
            data = parseMessageData(data),
        )
    }

    fun parseConversationEvent(payload: String): ConversationEventEnvelope {
        val obj = DustJson.parseToJsonElement(payload).jsonObject
        val data = obj.requiredDataObject()
        return ConversationEventEnvelope(
            eventId = obj.requiredString("eventId"),
            data = parseConversationData(data),
        )
    }

    fun parseSseDataLines(raw: String): List<String> =
        raw.lineSequence()
            .filter { it.startsWith("data:") }
            .map { it.removePrefix("data:").trim(' ') }
            .filter { it.isNotEmpty() && it != "done" }
            .toList()

    private fun parseConversationData(data: JsonObject): ConversationEventData =
        when (val type = data.requiredString("type")) {
            "agent_message_new" -> ConversationEventData.AgentMessageNew(
                DustJson.decodeFromJsonElement<AgentMessageNewEvent>(data),
            )
            "agent_message_done" -> ConversationEventData.AgentMessageDone(
                DustJson.decodeFromJsonElement<AgentMessageDoneEventData>(data),
            )
            "user_message_new" -> ConversationEventData.UserMessageNew(
                DustJson.decodeFromJsonElement<UserMessageNewEvent>(data),
            )
            "user_message_promoted" -> ConversationEventData.UserMessagePromoted(
                DustJson.decodeFromJsonElement<UserMessagePromotedEvent>(data),
            )
            "conversation_title" -> ConversationEventData.ConversationTitle(
                DustJson.decodeFromJsonElement<ConversationTitleEvent>(data),
            )
            else -> ConversationEventData.Unknown(type)
        }

    private fun parseMessageData(data: JsonObject): StreamingEventData =
        when (val type = data.requiredString("type")) {
            "generation_tokens" -> StreamingEventData.GenerationTokens(
                DustJson.decodeFromJsonElement<GenerationTokensEvent>(data),
            )
            "agent_action_success" -> StreamingEventData.AgentActionSuccess(
                DustJson.decodeFromJsonElement<AgentActionSuccessEvent>(data),
            )
            "tool_params" -> StreamingEventData.ToolParams(
                DustJson.decodeFromJsonElement<ToolParamsEvent>(data),
            )
            "tool_notification" -> StreamingEventData.ToolNotification(
                DustJson.decodeFromJsonElement<ToolNotificationEvent>(data),
            )
            "agent_message_success" -> StreamingEventData.AgentMessageSuccess(
                DustJson.decodeFromJsonElement<AgentMessageSuccessEvent>(data),
            )
            "agent_error" -> StreamingEventData.AgentError(
                DustJson.decodeFromJsonElement<AgentErrorEvent>(data),
            )
            "tool_error" -> StreamingEventData.ToolError(
                DustJson.decodeFromJsonElement<ToolErrorEvent>(data),
            )
            "agent_generation_cancelled" -> StreamingEventData.AgentGenerationCancelled(
                DustJson.decodeFromJsonElement<AgentGenerationCancelledEvent>(data),
            )
            "agent_message_gracefully_stopped" -> StreamingEventData.AgentMessageGracefullyStopped(
                DustJson.decodeFromJsonElement<AgentMessageGracefullyStoppedEvent>(data),
            )
            "tool_personal_auth_required" -> StreamingEventData.ToolPersonalAuthRequired(
                DustJson.decodeFromJsonElement<ToolPersonalAuthRequiredEvent>(data),
            )
            "tool_file_auth_required" -> StreamingEventData.ToolFileAuthRequired(
                DustJson.decodeFromJsonElement<ToolFileAuthRequiredEvent>(data),
            )
            "tool_approve_execution" -> StreamingEventData.ToolApproveExecution(
                DustJson.decodeFromJsonElement<ToolApproveExecutionEvent>(data),
            )
            "tool_ask_user_question" -> StreamingEventData.ToolAskUserQuestion(
                DustJson.decodeFromJsonElement<ToolAskUserQuestionEvent>(data),
            )
            "agent_context_pruned" -> StreamingEventData.AgentContextPruned
            "end-of-stream" -> StreamingEventData.EndOfStream
            else -> StreamingEventData.Unknown(type)
        }

    private fun JsonObject.requiredDataObject(): JsonObject {
        val data: JsonElement = this["data"] ?: error("Missing data")
        return data.jsonObject
    }
}
