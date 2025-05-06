use super::{
    chat_messages::{AssistantChatMessage, ChatMessage, UserChatMessage},
    llm::ChatMessageRole,
};

// Useful for models that don't support tools.
// For assistant messages, we remove function/tool calls (and we format them inside of the "content" field instead).
// For function/tool result messages, we transform them into user messages.
pub fn strip_tools_from_chat_history(messages: &Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut new_messages = Vec::new();
    for message in messages {
        match message {
            ChatMessage::System(message) => {
                new_messages.push(ChatMessage::System(message.clone()));
            }
            ChatMessage::User(message) => {
                new_messages.push(ChatMessage::User(message.clone()));
            }
            ChatMessage::Assistant(message) => {
                let mut content = message.content.clone().unwrap_or_default();
                if !content.is_empty() {
                    content = format!("{}\n", content);
                }
                if let Some(function_calls) = &message.function_calls {
                    if function_calls.len() > 0 {
                        let tool_calls_formatted = message
                            .function_calls
                            .clone()
                            .unwrap_or_default()
                            .iter()
                            .map(|call| format!("function_call {}({})", call.name, call.arguments))
                            .collect::<Vec<String>>()
                            .join("\n");
                        content = format!("{}{}", content, tool_calls_formatted);
                    }
                }
                new_messages.push(ChatMessage::Assistant(AssistantChatMessage {
                    content: Some(content),
                    name: message.name.clone(),
                    role: message.role.clone(),
                    function_call: None,
                    function_calls: None,
                }));
            }
            ChatMessage::Function(message) => {
                new_messages.push(ChatMessage::User(UserChatMessage {
                    content: message.content.clone(),
                    role: ChatMessageRole::User,
                    name: message.name.clone(),
                }));
            }
        }
    }

    new_messages
}
