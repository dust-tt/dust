import { Button, Folder, Link01, DotsHorizontal } from "@dust-tt/sparkle";
import { useState } from "react";
import type {
  Agent,
  Conversation,
  ConversationMessage,
} from "../../data/types";
import { mockUsers } from "../../data/users";
import { ConversationView } from "../ConversationView";
import type { InputBarMessage } from "../InputBar";
import type { WorkspaceState } from "./engine";
import { canonicalFile } from "./engine";
import { fileChip, linkifiedMessage, workspaceFileUrl } from "./fileLinks";
import type { PodWorkspaceView, WorkspaceFile } from "./model";

export function workspaceConversation(
  state: WorkspaceState,
  file: WorkspaceFile,
  podId: string
): Conversation {
  const run = state.runs.find((item) => item.conversationId === file.id);
  const agentId = run?.agentId ?? state.configurations[podId].defaultAgentId;
  const agent = state.files.find((item) => item.id === agentId);
  const date = new Date(run?.at ?? "2026-10-06T08:30:00Z");
  const speakers =
    /^(Emma|Lucas|Sophie|Thomas|Research analyst(?: · Demo (?:response|run))?|Proposal partner(?: · Demo (?:response|run))?)\n/gm;
  const segments: { name: string; text: string }[] = [];
  let offset = 0;
  let name = "Emma";
  for (const match of file.content.matchAll(speakers)) {
    const start = match.index ?? 0;
    if (start > offset && file.content.slice(offset, start).trim()) {
      segments.push({ name, text: file.content.slice(offset, start).trim() });
    }
    name = match[1].split(" · ")[0];
    offset = start + match[0].length;
  }
  if (file.content.slice(offset).trim()) {
    segments.push({ name, text: file.content.slice(offset).trim() });
  }
  const messages: ConversationMessage[] = segments.map((segment, index) => {
    const isAgent =
      segment.name === "Research analyst" ||
      segment.name === "Proposal partner";
    const user =
      mockUsers.find((item) => item.firstName === segment.name) ?? mockUsers[0];
    return {
      kind: "message",
      id: `${file.id}:message:${index}`,
      ownerId: isAgent ? agentId : user.id,
      ownerType: isAgent ? "agent" : "user",
      type: isAgent ? "agent" : "user",
      timestamp: new Date(date.getTime() + index * 60000),
      markdown: linkifiedMessage(segment.text, state.files)
        .replace(/^(.+ · \d+ accounts?)$/gm, "### $1")
        .replace(/^“(.+)”$/gm, "> $1"),
      group: {
        id: `${file.id}:group:${index}`,
        type: isAgent ? "agent" : user.id === "1" ? "locutor" : "interlocutor",
        name: isAgent ? (agent?.name ?? segment.name) : user.fullName,
        timestamp: new Date(date.getTime() + index * 60000).toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" }
        ),
        ...(isAgent
          ? {
              avatar: { emoji: "🔎", backgroundColor: "bg-rose-100" },
              completionStatus: "Completed",
            }
          : { avatar: { visual: user.portrait, isRounded: true } }),
      },
    };
  });
  const last = [...messages]
    .reverse()
    .find((message) => message.ownerType === "agent");
  if (last) {
    const sources = (file.sourceIds ?? [])
      .map((id) => state.files.find((item) => item.id === id))
      .filter((item): item is WorkspaceFile => !!item);
    if (sources.length) {
      last.markdown += `\n\n**Sources**\n\n${sources.map(fileChip).join(" · ")}`;
    }
    last.citations = state.files
      .filter((item) => item.parentId === file.id)
      .map((item) => canonicalFile(state.files, item.id))
      .filter((item): item is WorkspaceFile => !!item)
      .map((item) => ({
        id: item.id,
        title: item.name,
        icon: item.kind === "frame" ? "frame" : "document",
      }));
  }
  return {
    id: file.id,
    title: file.name,
    createdAt: date,
    updatedAt: date,
    userParticipants: ["1", "2", "3"],
    agentParticipants: [agentId],
    messages,
    spaceId: podId,
    triggerId: run?.triggerId,
  };
}

export function WorkspaceConversation({
  file,
  state,
  podId,
  onOpen,
  onSend,
}: {
  file: WorkspaceFile;
  state: WorkspaceState;
  podId: string;
  onOpen: (view: PodWorkspaceView) => void;
  onSend: (message: InputBarMessage) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const conversation = workspaceConversation(state, file, podId);
  const agents: Agent[] = state.files
    .filter((item) => item.kind === "agent")
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      emoji: "🔎",
      backgroundColor: "bg-rose-100",
    }));
  const agent = agents.find(
    (item) => item.id === conversation.agentParticipants[0]
  );
  return (
    <section aria-label={file.name} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-3 py-2">
        {copyError && (
          <span role="status" className="text-xs text-muted-foreground">
            {copyError}
          </span>
        )}
        <Button
          icon={Link01}
          tooltip={copied ? "Link copied" : "Copy link"}
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard
              .writeText(workspaceFileUrl(file.id))
              .then(() => setCopied(true))
              .catch(() => setCopyError("Couldn’t copy the link."));
          }}
        />
        <Button
          icon={Folder}
          tooltip="Conversation files"
          variant="ghost"
          size="xs"
          onClick={() =>
            onOpen({ kind: "conversation-files", fileId: file.id })
          }
        />
        <Button
          icon={DotsHorizontal}
          tooltip="Location and sharing"
          variant="ghost"
          size="xs"
          onClick={() => onOpen({ kind: "file-details", fileId: file.id })}
        />
      </div>
      <ConversationView
        conversation={conversation}
        locutor={mockUsers[0]}
        users={mockUsers}
        agents={agents}
        conversationsWithMessages={[]}
        agentLabel={agent?.name}
        onAgentClick={() => agent && onOpen({ kind: "file", fileId: agent.id })}
        onSubmitMessage={onSend}
        onCitationOpen={(citation) => {
          const id = citation.id
            ? decodeURIComponent(citation.id)
            : state.files.find((item) => item.name === citation.title)?.id;
          if (id && state.files.some((item) => item.id === id)) {
            onOpen({ kind: "file", fileId: id });
          }
        }}
      />
    </section>
  );
}
