import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitMessage } from "@app/hooks/useSubmitMessage";
import { isToolExecutionStatusBlocked } from "@app/lib/actions/statuses";
import { liveDelegationInput, splitLiveAppend } from "@app/lib/client/live";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { PostConversationsResponseBodySchema } from "@app/types/api/assistant";
import type { FetchConversationMessageResponse } from "@app/types/api/assistant/messages";
import {
  isAgentMessageType,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type {
  LiveConnectionStatus,
  LiveTranscriptFragment,
} from "@app/types/assistant/live";
import {
  LiveEventSchema,
  LiveSessionResponseSchema,
} from "@app/types/assistant/live";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useCreateLiveConversation(owner: WorkspaceType) {
  const sendNotification = useSendNotification();
  return useCallback(
    async ({
      spaceId,
      selectedSpaceIds,
    }: {
      spaceId?: string;
      selectedSpaceIds?: string[];
    }): Promise<Result<string, undefined>> => {
      const notifyFailure = () => {
        sendNotification({
          type: "error",
          title: "Could not start voice",
          description: "Unable to create the conversation. Please try again.",
        });
        return new Err(undefined);
      };
      let response: Response;
      try {
        response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: null,
              visibility: "unlisted",
              spaceId: spaceId ?? null,
              selectedSpaceIds,
              skipToolsValidation: false,
              message: null,
              contentFragments: [],
            }),
          }
        );
      } catch (error) {
        if (error instanceof TypeError || error instanceof DOMException) {
          return notifyFailure();
        }
        throw error;
      }
      if (!response.ok) {
        return notifyFailure();
      }
      const result = PostConversationsResponseBodySchema.safeParse(
        await response.json()
      );
      return result.success
        ? new Ok(result.data.conversation.sId)
        : notifyFailure();
    },
    [owner.sId, sendNotification]
  );
}

interface LiveConnection {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  microphone: MediaStream;
  audio: HTMLAudioElement;
  timer: ReturnType<typeof setTimeout>;
  ready: boolean;
}

async function waitForIce(
  peer: RTCPeerConnection
): Promise<Result<void, string>> {
  if (peer.iceGatheringState === "complete") {
    return new Ok(undefined);
  }
  return new Promise((resolve) => {
    const finish = (result: Result<void, string>) => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve(result);
    };
    const onChange = () => {
      if (peer.iceGatheringState === "complete") {
        finish(new Ok(undefined));
      }
    };
    const timeout = setTimeout(
      () => finish(new Err("Timed out connecting the microphone.")),
      10_000
    );
    peer.addEventListener("icegatheringstatechange", onChange);
    onChange();
  });
}

/**
 * @cc [owner:aubin-tchoi,label:security;product] live-delegation-uses-harness
 * Delegated work MUST use the normal authenticated message submission path with
 * tool validation enabled. Voice events MUST NOT approve tools or answer question
 * cards. Duplicate delegation IDs MUST NOT create duplicate Dust messages.
 */
export function useLiveConversation({
  owner,
  user,
  conversationId,
  agentId,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  agentId: string;
}) {
  const [status, setStatus] = useState<LiveConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState<LiveTranscriptFragment[]>([]);
  const [task, setTask] = useState<{
    delegationId: string;
    messageId: string;
  } | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const connection = useRef<LiveConnection | null>(null);
  const epoch = useRef(0);
  const fragments = useRef<LiveTranscriptFragment[]>([]);
  const seen = useRef(new Set<string>());
  const delegations = useRef<{ id: string; input: string }[]>([]);
  const delegatedThrough = useRef(-1);
  const busy = useRef(false);
  const blockedActionIds = useRef(new Set<string>());
  const completedMessageIds = useRef(new Set<string>());
  const submitMessage = useSubmitMessage({ owner, user, conversationId });
  const { fetcher } = useFetcher();
  const { data, error: taskError } = useSWRWithDefaults<
    string | null,
    FetchConversationMessageResponse
  >(
    task
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${task.messageId}`
      : null,
    fetcher,
    { refreshInterval: 1_000, revalidateOnFocus: false }
  );

  const append = useCallback(
    (
      type: "session.thinking.append" | "session.commentary.append",
      delegationId: string,
      content: string
    ) => {
      const live = connection.current;
      if (!live?.ready || live.channel.readyState !== "open") {
        return;
      }
      for (const chunk of splitLiveAppend(content)) {
        live.channel.send(
          JSON.stringify({
            type,
            event_id: crypto.randomUUID(),
            delegation_id: delegationId,
            content: chunk,
          })
        );
      }
    },
    []
  );

  const cleanup = useCallback(() => {
    epoch.current += 1;
    const live = connection.current;
    connection.current = null;
    if (live) {
      clearTimeout(live.timer);
      live.microphone.getTracks().forEach((track) => track.stop());
      live.audio.pause();
      live.audio.srcObject = null;
      live.channel.close();
      live.peer.close();
    }
    delegations.current = [];
    busy.current = false;
    setTask(null);
  }, []);

  const fail = useCallback(
    (message: string) => {
      cleanup();
      setError(message);
      setStatus("error");
    },
    [cleanup]
  );

  const runNext = useCallback(async () => {
    if (busy.current || !connection.current?.ready) {
      return;
    }
    const delegation = delegations.current.shift();
    if (!delegation) {
      return;
    }
    const delegationId = delegation.id;
    busy.current = true;
    const currentEpoch = epoch.current;
    setTaskStatus("Sending to your Dust agent…");
    const result = await submitMessage({
      input: delegation.input,
      mentions: [{ configurationId: agentId }],
      contentFragments: { uploaded: [], contentNodes: [] },
      skipToolsValidation: false,
    });
    if (epoch.current !== currentEpoch) {
      return;
    }
    if (result.isErr()) {
      append(
        "session.commentary.append",
        delegationId,
        `The request could not be sent: ${result.error.message}`
      );
      setError(result.error.message);
      setTaskStatus("Request could not be sent. Try again.");
      busy.current = false;
      setQueueVersion((version) => version + 1);
      return;
    }
    const message = result.value.agentMessages[0];
    if (!message) {
      append(
        "session.commentary.append",
        delegationId,
        "The agent needs access confirmation in the chat before it can respond. Ask the user to check the chat."
      );
      setTaskStatus("Check the access confirmation in chat.");
      busy.current = false;
      setQueueVersion((version) => version + 1);
      return;
    }
    setTask({ delegationId, messageId: message.sId });
    setTaskStatus("Your Dust agent is working…");
    append(
      "session.thinking.append",
      delegationId,
      "The Dust agent is working. No action has been confirmed yet."
    );
  }, [agentId, append, submitMessage]);

  // Drain serialized delegations when a new request arrives or the previous
  // request finishes, including failures to submit it.
  useEffect(() => {
    if (queueVersion > 0) {
      void runNext();
    }
  }, [queueVersion, runNext]);

  // Synchronize persisted Dust task state into the external Live session. Polling
  // also recovers completions that happened before the message POST returned.
  useEffect(() => {
    if (
      !task ||
      !data ||
      data.message.sId !== task.messageId ||
      completedMessageIds.current.has(task.messageId) ||
      !isAgentMessageType(data.message)
    ) {
      return;
    }
    const message = data.message;
    if (isTerminalAgentMessageStatus(message.status)) {
      completedMessageIds.current.add(task.messageId);
      const content =
        message.status === "succeeded" ||
        message.status === "gracefully_stopped"
          ? (message.content ??
            "The agent finished without a text response. Check the chat for its output.")
          : `The Dust task ${message.status}. ${message.error?.message ?? "Check the chat for details."}`;
      append("session.commentary.append", task.delegationId, content);
      setTask(null);
      setTaskStatus("Result available in chat");
      busy.current = false;
      setQueueVersion((version) => version + 1);
      return;
    }
    const blocked = message.actions.filter((action) =>
      isToolExecutionStatusBlocked(action.status)
    );
    if (blocked.length > 0) {
      setTaskStatus("Your input is needed in chat");
      for (const action of blocked) {
        if (!blockedActionIds.current.has(action.sId)) {
          blockedActionIds.current.add(action.sId);
          append(
            "session.commentary.append",
            task.delegationId,
            "The Dust agent needs your input. Please use the approval, question, or sign-in card in the chat; this task is waiting."
          );
        }
      }
    } else {
      setTaskStatus("Your Dust agent is working…");
    }
  }, [append, data, task]);

  const stop = useCallback(() => {
    const live = connection.current;
    if (!live?.ready || live.channel.readyState !== "open") {
      cleanup();
      setStatus("closed");
      return;
    }
    live.ready = false;
    live.microphone.getTracks().forEach((track) => {
      track.enabled = false;
    });
    live.audio.pause();
    setStatus("closing");
    clearTimeout(live.timer);
    live.timer = setTimeout(
      () =>
        fail(
          "Call ended before OpenAI confirmed final usage. Your Dust tasks remain in chat."
        ),
      10_000
    );
    live.channel.send(JSON.stringify({ type: "session.close" }));
  }, [cleanup, fail]);

  const start = useCallback(
    async (audio: HTMLAudioElement) => {
      if (connection.current) {
        return;
      }
      const currentEpoch = ++epoch.current;
      setStatus("connecting");
      setError(null);
      setMuted(false);
      setSeconds(0);
      setTranscript([]);
      setTaskStatus(null);
      fragments.current = [];
      delegatedThrough.current = -1;
      seen.current.clear();
      blockedActionIds.current.clear();
      completedMessageIds.current.clear();

      let microphone: MediaStream;
      try {
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (error) {
        if (epoch.current === currentEpoch) {
          fail(`Microphone unavailable: ${normalizeError(error).message}`);
        }
        return;
      }
      if (epoch.current !== currentEpoch) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("oai-events");
      const live: LiveConnection = {
        peer,
        channel,
        microphone,
        audio,
        ready: false,
        timer: setTimeout(
          () => fail("Timed out starting live voice. Please try again."),
          45_000
        ),
      };
      connection.current = live;
      microphone
        .getAudioTracks()
        .forEach((track) => peer.addTrack(track, microphone));
      peer.ontrack = ({ track }) => {
        audio.srcObject = new MediaStream([track]);
        void audio
          .play()
          .catch(() =>
            setError("Press play in the audio controls to hear the assistant.")
          );
      };
      channel.onclose = () => {
        if (connection.current === live) {
          fail(
            "Voice disconnected. Any running Dust task is still available in chat."
          );
        }
      };
      channel.onmessage = ({ data: raw }) => {
        if (connection.current !== live) {
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }
        const parsed = LiveEventSchema.safeParse(payload);
        if (!parsed.success) {
          return;
        }
        const event = parsed.data;
        switch (event.type) {
          case "session.started":
            clearTimeout(live.timer);
            live.ready = true;
            setStatus("connected");
            // Bound the POC's duration; voice billing is separate from Dust tokens.
            live.timer = setTimeout(stop, 15 * 60_000);
            break;
          case "session.input_transcript.delta":
          case "session.output_transcript.delta": {
            if (seen.current.has(event.event_id)) {
              break;
            }
            seen.current.add(event.event_id);
            const fragment: LiveTranscriptFragment = {
              id: event.event_id,
              speaker:
                event.type === "session.input_transcript.delta"
                  ? "user"
                  : "assistant",
              text: event.delta,
              startMs: event.start_ms,
              endMs: event.end_ms,
            };
            fragments.current = [...fragments.current, fragment];
            setTranscript(fragments.current);
            break;
          }
          case "session.delegation.created":
            if (!live.ready || seen.current.has(event.delegation.id)) {
              break;
            }
            seen.current.add(event.delegation.id);
            // Transcripts and delegation metadata travel independently. Allow late
            // fragments to arrive before taking the backend context snapshot.
            setTimeout(() => {
              if (connection.current === live) {
                const pending = fragments.current.filter(
                  (fragment) =>
                    fragment.startMs > delegatedThrough.current &&
                    fragment.startMs <= event.offset_ms
                );
                delegatedThrough.current = event.offset_ms;
                if (!pending.some((fragment) => fragment.speaker === "user")) {
                  append(
                    "session.commentary.append",
                    event.delegation.id,
                    "No new spoken request was available. Ask the user to repeat their request."
                  );
                  return;
                }
                delegations.current.push({
                  id: event.delegation.id,
                  input: liveDelegationInput(pending),
                });
                setQueueVersion((version) => version + 1);
              }
            }, 250);
            break;
          case "session.usage.updated":
            setSeconds(event.usage.seconds);
            break;
          case "session.closed":
            setSeconds(event.usage.seconds);
            cleanup();
            setStatus("closed");
            break;
          case "error":
            setError(event.error.message);
            break;
        }
      };

      try {
        await peer.setLocalDescription(await peer.createOffer());
        const ice = await waitForIce(peer);
        if (epoch.current !== currentEpoch) {
          return;
        }
        if (ice.isErr() || !peer.localDescription?.sdp) {
          fail(ice.isErr() ? ice.error : "Unable to connect the microphone.");
          return;
        }
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/live`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, sdp: peer.localDescription.sdp }),
            signal: AbortSignal.timeout(35_000),
          }
        );
        const body = await response.json();
        if (epoch.current !== currentEpoch) {
          return;
        }
        const result = LiveSessionResponseSchema.safeParse(body);
        if (!response.ok || !result.success) {
          fail(
            "Could not start live voice. Check that this workspace has GPT-Live enabled and an eligible OpenAI key."
          );
          return;
        }
        await peer.setRemoteDescription({
          type: "answer",
          sdp: result.data.transport.sdp,
        });
      } catch (error) {
        if (epoch.current === currentEpoch) {
          fail(normalizeError(error).message);
        }
      }
    },
    [agentId, append, cleanup, conversationId, fail, owner.sId, stop]
  );

  // Release the microphone on navigation. Ending voice does not cancel durable
  // backend tasks, which remain visible and controllable in the conversation.
  useEffect(
    () => () => {
      const live = connection.current;
      if (live?.channel.readyState === "open") {
        live.channel.send(JSON.stringify({ type: "session.close" }));
      }
      cleanup();
    },
    [cleanup]
  );

  const toggleMute = useCallback(() => {
    const live = connection.current;
    if (!live) {
      return;
    }
    setMuted((previous) => {
      live.microphone.getAudioTracks().forEach((track) => {
        track.enabled = previous;
      });
      return !previous;
    });
  }, []);

  return useMemo(
    () => ({
      status,
      error:
        error ??
        (taskError
          ? "Unable to refresh the Dust task. Check the chat; retrying…"
          : null),
      muted,
      seconds,
      transcript,
      taskStatus,
      start,
      stop,
      toggleMute,
    }),
    [
      status,
      error,
      taskError,
      muted,
      seconds,
      transcript,
      taskStatus,
      start,
      stop,
      toggleMute,
    ]
  );
}
