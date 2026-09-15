import {
  applyConversationFont,
  CONVERSATION_FONT_METADATA_KEY,
  ConversationFontProvider,
  isConversationFont,
  useConversationFont,
} from "@app/components/sparkle/ConversationFontContext";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metadataValue: null as string | null,
  mutateMetadata: vi.fn(),
  clientFetch: vi.fn(),
}));

vi.mock("@app/lib/swr/user", () => ({
  useUserMetadata: () => ({
    metadata: mocks.metadataValue
      ? { key: CONVERSATION_FONT_METADATA_KEY, value: mocks.metadataValue }
      : null,
    isMetadataLoading: false,
    isMetadataError: undefined,
    mutateMetadata: mocks.mutateMetadata,
  }),
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mocks.clientFetch(...args),
}));

vi.mock("@app/logger/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <ConversationFontProvider>{children}</ConversationFontProvider>
);

const fontAttribute = () =>
  document.documentElement.getAttribute("data-conversation-font");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-conversation-font");
  mocks.metadataValue = null;
  mocks.mutateMetadata.mockReset();
  mocks.clientFetch.mockReset();
  mocks.clientFetch.mockResolvedValue({ ok: true });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-conversation-font");
});

describe("isConversationFont", () => {
  it("accepts the three options and rejects anything else", () => {
    expect(isConversationFont("sans")).toBe(true);
    expect(isConversationFont("serif")).toBe(true);
    expect(isConversationFont("dyslexic")).toBe(true);
    expect(isConversationFont("comic")).toBe(false);
    expect(isConversationFont(null)).toBe(false);
  });
});

describe("applyConversationFont", () => {
  it("sets the attribute for non-default fonts and removes it for sans", () => {
    applyConversationFont("serif");
    expect(fontAttribute()).toBe("serif");
    applyConversationFont("sans");
    expect(fontAttribute()).toBeNull();
  });
});

describe("ConversationFontProvider", () => {
  it("defaults to sans with no attribute on <html>", () => {
    const { result } = renderHook(() => useConversationFont(), { wrapper });
    expect(result.current.conversationFont).toBe("sans");
    expect(fontAttribute()).toBeNull();
  });

  it("starts from the localStorage mirror before the server answers", () => {
    localStorage.setItem("conversationFont", "dyslexic");
    const { result } = renderHook(() => useConversationFont(), { wrapper });
    expect(result.current.conversationFont).toBe("dyslexic");
    expect(fontAttribute()).toBe("dyslexic");
  });

  it("lets the server value override the local mirror", async () => {
    localStorage.setItem("conversationFont", "sans");
    mocks.metadataValue = "serif";
    const { result } = renderHook(() => useConversationFont(), { wrapper });
    await waitFor(() => {
      expect(result.current.conversationFont).toBe("serif");
    });
    expect(fontAttribute()).toBe("serif");
    expect(localStorage.getItem("conversationFont")).toBe("serif");
  });

  it("ignores an unknown server value", () => {
    mocks.metadataValue = "wingdings";
    const { result } = renderHook(() => useConversationFont(), { wrapper });
    expect(result.current.conversationFont).toBe("sans");
  });

  it("applies immediately, persists to metadata and reports success", async () => {
    const { result } = renderHook(() => useConversationFont(), { wrapper });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.setConversationFont("serif");
    });

    expect(saved).toBe(true);
    expect(result.current.conversationFont).toBe("serif");
    expect(fontAttribute()).toBe("serif");
    expect(localStorage.getItem("conversationFont")).toBe("serif");
    expect(mocks.clientFetch).toHaveBeenCalledWith(
      `/api/user/metadata/${CONVERSATION_FONT_METADATA_KEY}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "serif" }),
      })
    );
    expect(mocks.mutateMetadata).toHaveBeenCalledWith(
      { metadata: { key: CONVERSATION_FONT_METADATA_KEY, value: "serif" } },
      { revalidate: false }
    );
  });

  it("keeps the local choice but reports failure when the save fails", async () => {
    mocks.clientFetch.mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useConversationFont(), { wrapper });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.setConversationFont("dyslexic");
    });

    expect(saved).toBe(false);
    expect(result.current.conversationFont).toBe("dyslexic");
    expect(fontAttribute()).toBe("dyslexic");
    expect(mocks.mutateMetadata).not.toHaveBeenCalled();
  });
});
