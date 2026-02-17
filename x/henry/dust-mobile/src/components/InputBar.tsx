import React, { useState, useCallback, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
} from "react-native";
import type { AgentMentionType, LightAgentConfigurationType } from "@dust-tt/client";
import { MentionBadge } from "./MentionBadge";
import { AgentPicker } from "./AgentPicker";

type Props = {
  onSend: (content: string, mentions: AgentMentionType[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  isSubmitting: boolean;
  initialAgentId?: string;
};

export function InputBar({
  onSend,
  onCancel,
  isStreaming,
  isSubmitting,
  initialAgentId,
}: Props) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<
    { configurationId: string; name: string }[]
  >(initialAgentId ? [{ configurationId: initialAgentId, name: "" }] : []);
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && mentions.length === 0) return;

    const agentMentions: AgentMentionType[] = mentions.map((m) => ({
      configurationId: m.configurationId,
    }));

    onSend(trimmed, agentMentions);
    setText("");
    setMentions([]);
  }, [text, mentions, onSend]);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      // Detect @ trigger
      if (value.endsWith("@")) {
        setShowPicker(true);
      }
    },
    []
  );

  const handleAgentSelect = useCallback(
    (agent: LightAgentConfigurationType) => {
      setShowPicker(false);
      setMentions((prev) => [
        ...prev,
        { configurationId: agent.sId, name: agent.name },
      ]);
      // Remove trailing @ from text
      setText((prev) => (prev.endsWith("@") ? prev.slice(0, -1) : prev));
      inputRef.current?.focus();
    },
    []
  );

  const handleRemoveMention = useCallback((index: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const disabled = isStreaming || isSubmitting;

  return (
    <View style={styles.container}>
      {/* Mention badges */}
      {mentions.length > 0 && (
        <View style={styles.mentionsRow}>
          {mentions.map((m, idx) => (
            <MentionBadge
              key={`${m.configurationId}-${idx}`}
              name={m.name || "Agent"}
              onRemove={() => handleRemoveMention(idx)}
            />
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Message..."
          placeholderTextColor="#999"
          multiline
          maxLength={32000}
          editable={!disabled}
        />

        {isStreaming ? (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!text.trim() && mentions.length === 0) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() && mentions.length === 0}
          >
            <Text style={styles.sendText}>↑</Text>
          </TouchableOpacity>
        )}
      </View>

      {showPicker && (
        <AgentPicker
          onSelect={handleAgentSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 12,
  },
  mentionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    lineHeight: 22,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
  sendText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#e53e3e",
    borderRadius: 17,
  },
  cancelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
