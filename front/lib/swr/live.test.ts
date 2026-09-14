import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@app/lib/swr/fetcher";
import { useLiveConversation } from "@app/lib/swr/live";
import type { UserType, WorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const owner: WorkspaceType = {
  id: 1,
  sId: "workspace",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};
const user: UserType = {
  id: 1,
  sId: "user",
  username: "user",
  email: "user@example.com",
  firstName: "User",
  lastName: null,
  fullName: "User",
  image: null,
  provider: null,
  createdAt: 0,
  lastLoginAt: null,
};

class Channel {
  readyState = "open";
  send = vi.fn();
  close = vi.fn();
  onmessage?: (event: { data: string }) => void;
  emit(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}
const channel = new Channel();
const track = { enabled: true, stop: vi.fn() };
const microphone = { getTracks: () => [track], getAudioTracks: () => [track] };
const closePeer = vi.fn();
const getUserMedia = vi.fn();
class Peer {
  iceGatheringState = "complete";
  localDescription = { sdp: "offer" };
  createDataChannel() {
    return channel;
  }
  addTrack() {}
  async createOffer() {
    return { sdp: "offer" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close = closePeer;
}

let messageStatus = "created";
let blocked = false;
let blockedStatus = "blocked_validation_required";
let postCount = 0;
const requests: { url: string; body: unknown }[] = [];

function setupHook() {
  const cache = new Map();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      SWRConfig,
      { value: { provider: () => cache, dedupingInterval: 0 } },
      createElement(FetcherProvider, { fetcher, fetcherWithBody, children })
    );
  return renderHook(
    () =>
      useLiveConversation({
        owner,
        user,
        conversationId: "conversation",
        agentId: "dust",
      }),
    { wrapper }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  messageStatus = "created";
  blocked = false;
  postCount = 0;
  requests.length = 0;
  track.enabled = true;
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: getUserMedia.mockResolvedValue(microphone) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/live")) {
        return Response.json({
          session: { id: "live" },
          transport: { type: "webrtc", sdp: "answer" },
        });
      }
      if (init?.method === "POST") {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({
          agentMessages: [{ sId: `message_${++postCount}` }],
        });
      }
      return Response.json({
        message: {
          type: "agent_message",
          sId: `message_${postCount}`,
          status: messageStatus,
          content: "391",
          actions: blocked ? [{ sId: "action", status: blockedStatus }] : [],
        },
      });
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live delegation lifecycle", () => {
  it.each([
    "blocked_validation_required",
    "blocked_user_answer_required",
  ])("deduplicates requests and relays the result after %s is resolved", async (status) => {
    blockedStatus = status;
    const { result, unmount } = setupHook();
    await act(async () => {
      await result.current.start(document.createElement("audio"));
    });
    act(() => channel.emit({ type: "session.started" }));
    act(() => {
      channel.emit({
        type: "session.input_transcript.delta",
        event_id: "speech",
        delta: "Calculate 17 * 23",
        start_ms: 0,
        end_ms: 1000,
      });
      const delegation = {
        type: "session.delegation.created",
        offset_ms: 1000,
        delegation: { id: "delegation", target: "client" },
      };
      channel.emit(delegation);
      channel.emit(delegation);
    });
    blocked = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({
      skipToolsValidation: false,
      mentions: [{ configurationId: "dust" }],
    });
    expect(result.current.taskStatus).toBe("Your input is needed in chat");
    expect(
      channel.send.mock.calls.filter(
        ([raw]) => JSON.parse(raw).type === "session.commentary.append"
      )
    ).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(requests).toHaveLength(1);
    expect(
      channel.send.mock.calls.filter(
        ([raw]) => JSON.parse(raw).type === "session.commentary.append"
      )
    ).toHaveLength(1);
    blocked = false;
    messageStatus = "succeeded";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      channel.send.mock.calls.map(([raw]) => JSON.parse(raw))
    ).toContainEqual(
      expect.objectContaining({
        type: "session.commentary.append",
        delegation_id: "delegation",
        content: "391",
      })
    );
    act(() => result.current.stop());
    expect(result.current.status).toBe("closing");
    expect(closePeer).not.toHaveBeenCalled();
    act(() =>
      channel.emit({
        type: "session.closed",
        reason: "close_requested",
        usage: { seconds: 12 },
      })
    );
    expect(result.current.status).toBe("closed");
    expect(result.current.seconds).toBe(12);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(closePeer).toHaveBeenCalledOnce();
    unmount();
  });

  it("releases a microphone that resolves after the user cancels", async () => {
    let resolveMicrophone: (stream: typeof microphone) => void = () => {};
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMicrophone = resolve;
        })
    );
    const { result, unmount } = setupHook();
    let start: Promise<void>;
    act(() => {
      start = result.current.start(document.createElement("audio"));
    });
    act(() => result.current.stop());
    await act(async () => {
      resolveMicrophone(microphone);
      await start;
    });
    expect(result.current.status).toBe("closed");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    unmount();
  });
});
