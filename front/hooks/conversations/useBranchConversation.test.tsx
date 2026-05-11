import {
  ConversationBranchingProvider,
  useConversationBranchingContextValue,
} from "@app/components/assistant/conversation/ConversationBranchingContext";
import { useBranchConversation } from "@app/hooks/conversations/useBranchConversation";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientFetch = vi.fn();
const mockMutateConversations = vi.fn();
const mockPush = vi.fn();
const mockSendNotification = vi.fn();

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@app/hooks/conversations/useConversations", () => ({
  useConversations: () => ({
    mutateConversations: mockMutateConversations,
  }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => mockSendNotification,
}));

vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: (workspaceId: string, conversationId: string) =>
    `/w/${workspaceId}/assistant/conversations/${conversationId}`,
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_123",
  name: "Test workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function makeForkResponse(conversationId: string) {
  return new Response(
    JSON.stringify({
      conversationId,
      parentConversationTitle: null,
      spaceId: null,
    }),
    { status: 200 }
  );
}

function makeDeferredFetch() {
  const { promise: fetchPromise, resolve: resolveFetch } =
    Promise.withResolvers<Response>();

  return {
    fetchPromise,
    resolveFetch,
  };
}

describe("useBranchConversation", () => {
  beforeEach(() => {
    mockClientFetch.mockReset();
    mockMutateConversations.mockReset();
    mockPush.mockReset();
    mockSendNotification.mockReset();
  });

  it("does not require a shared branching provider", () => {
    const { result } = renderHook(() =>
      useBranchConversation({
        owner,
        conversationId: "c_parent",
      })
    );

    expect(result.current.isBranching).toBe(false);
  });

  it("uses local pending state when rendered outside the shared provider", async () => {
    const { fetchPromise, resolveFetch } = makeDeferredFetch();
    mockClientFetch.mockReturnValue(fetchPromise);

    const { result } = renderHook(() =>
      useBranchConversation({
        owner,
        conversationId: "c_parent",
      })
    );

    let branchPromise: Promise<boolean>;
    act(() => {
      branchPromise = result.current.branchConversation();
    });

    expect(result.current.isBranching).toBe(true);

    await act(async () => {
      resolveFetch(makeForkResponse("c_child"));
      await branchPromise;
    });

    expect(result.current.isBranching).toBe(false);
    expect(mockPush).toHaveBeenCalledWith(
      "/w/w_123/assistant/conversations/c_child"
    );
  });

  it("shares pending state between hooks inside the shared provider", async () => {
    const { fetchPromise, resolveFetch } = makeDeferredFetch();
    mockClientFetch.mockReturnValue(fetchPromise);

    const wrapper = ({ children }: { children: React.ReactNode }) => {
      const value = useConversationBranchingContextValue();

      return (
        <ConversationBranchingProvider value={value}>
          {children}
        </ConversationBranchingProvider>
      );
    };

    const { result } = renderHook(
      () => ({
        titleAction: useBranchConversation({
          owner,
          conversationId: "c_parent",
        }),
        sidebarAction: useBranchConversation({
          owner,
          conversationId: "c_parent",
        }),
      }),
      { wrapper }
    );

    let branchPromise: Promise<boolean>;
    act(() => {
      branchPromise = result.current.titleAction.branchConversation();
    });

    expect(result.current.titleAction.isBranching).toBe(true);
    expect(result.current.sidebarAction.isBranching).toBe(true);

    await act(async () => {
      resolveFetch(makeForkResponse("c_child"));
      await branchPromise;
    });

    expect(result.current.titleAction.isBranching).toBe(false);
    expect(result.current.sidebarAction.isBranching).toBe(false);
  });
});
