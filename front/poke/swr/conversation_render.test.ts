import { clientFetch } from "@app/lib/egress/client";
import { usePokeRenderConversation } from "@app/poke/swr/conversation_render";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/client", () => ({ clientFetch: vi.fn() }));

const owner = LightWorkspaceFactory.build({ sId: "workspace_1" });
const conversationId = "conversation_1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePokeRenderConversation", () => {
  it("renders with the selected agent and context size, then clears the result", async () => {
    const response = Promise.withResolvers<Response>();
    vi.mocked(clientFetch).mockReturnValueOnce(response.promise);
    const renderedConversation = {
      tokensUsed: 42,
      modelContextSizeUsed: 4096,
      modelIdUsed: "test-model",
      modelConversation: [{ role: "user", content: "Hello" }],
      promptTokenCountApprox: 10,
      systemPrompt: "Be helpful.",
      toolsTokenCountApprox: 5,
    };
    const { result } = renderHook(() =>
      usePokeRenderConversation({ owner, conversationId })
    );

    let rendering: Promise<void> | undefined;
    act(() => {
      rendering = result.current.renderConversation("agent_1", "4096");
    });
    expect(result.current.isRendering).toBe(true);
    expect(clientFetch).toHaveBeenCalledWith(
      "/api/poke/workspaces/workspace_1/conversations/conversation_1/render",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "agent_1", contextSizeOverride: 4096 }),
      }
    );

    await act(async () => {
      response.resolve(Response.json(renderedConversation));
      await rendering;
    });
    expect(result.current.isRendering).toBe(false);
    expect(result.current.renderError).toBeNull();
    expect(result.current.renderResult).toEqual(renderedConversation);

    act(() => result.current.clearRenderResult());
    expect(result.current.renderResult).toBeNull();
    expect(result.current.renderError).toBeNull();
  });

  it("reports API and network failures and allows another render", async () => {
    vi.mocked(clientFetch)
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "Agent not found" } },
          { status: 404 }
        )
      )
      .mockRejectedValueOnce(new Error("Network unavailable"));
    const { result } = renderHook(() =>
      usePokeRenderConversation({ owner, conversationId })
    );

    await act(async () => {
      await result.current.renderConversation("agent_1", "");
    });
    expect(result.current.renderError).toBe("Agent not found");
    expect(result.current.renderResult).toBeNull();
    expect(result.current.isRendering).toBe(false);
    expect(clientFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ agentId: "agent_1", contextSizeOverride: null }),
      })
    );

    await act(async () => {
      await result.current.renderConversation("agent_1", "");
    });
    expect(result.current.renderError).toBe("Network unavailable");
    expect(result.current.isRendering).toBe(false);

    act(() => result.current.clearRenderResult());
    expect(result.current.renderError).toBeNull();
  });

  it("requires an agent before sending a render request", async () => {
    const { result } = renderHook(() =>
      usePokeRenderConversation({ owner, conversationId })
    );

    await act(async () => {
      await result.current.renderConversation("", "");
    });
    expect(clientFetch).not.toHaveBeenCalled();
    expect(result.current.renderError).toBe("Select an agent sId first.");
    expect(result.current.isRendering).toBe(false);
  });
});
