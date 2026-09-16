import {
  ACCENT_COLOR_METADATA_KEY,
  AccentColorProvider,
  applyAccentColor,
  isAccentColor,
  useAccentColor,
} from "@app/components/sparkle/AccentColorContext";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  metadataValue: null as string | null,
  mutateMetadata: vi.fn(),
  setUserMetadataFromClient: vi.fn(),
}));

vi.mock("@app/lib/swr/user", () => ({
  useUserMetadata: () => ({
    metadata: mocks.metadataValue
      ? { key: ACCENT_COLOR_METADATA_KEY, value: mocks.metadataValue }
      : null,
    isMetadataLoading: false,
    isMetadataError: undefined,
    mutateMetadata: mocks.mutateMetadata,
  }),
}));

vi.mock("@app/lib/user", () => ({
  setUserMetadataFromClient: (...args: unknown[]) =>
    mocks.setUserMetadataFromClient(...args),
}));

vi.mock("@app/logger/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AccentColorProvider>{children}</AccentColorProvider>
);

const accentAttribute = () =>
  document.documentElement.getAttribute("data-accent");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-accent");
  mocks.metadataValue = null;
  mocks.mutateMetadata.mockReset();
  mocks.setUserMetadataFromClient.mockReset();
  mocks.setUserMetadataFromClient.mockResolvedValue(undefined);
});

afterEach(() => {
  document.documentElement.removeAttribute("data-accent");
});

describe("isAccentColor", () => {
  it("accepts palette scales and rejects anything else", () => {
    expect(isAccentColor("blue")).toBe(true);
    expect(isAccentColor("rose")).toBe(true);
    expect(isAccentColor("stone")).toBe(false);
    expect(isAccentColor(null)).toBe(false);
  });
});

describe("applyAccentColor", () => {
  it("sets the attribute for non-default colors and removes it for blue", () => {
    applyAccentColor("rose");
    expect(accentAttribute()).toBe("rose");
    applyAccentColor("blue");
    expect(accentAttribute()).toBeNull();
  });
});

describe("AccentColorProvider", () => {
  it("defaults to blue with no attribute on <html>", () => {
    const { result } = renderHook(() => useAccentColor(), { wrapper });
    expect(result.current.accentColor).toBe("blue");
    expect(accentAttribute()).toBeNull();
  });

  it("starts from the localStorage mirror before the server answers", () => {
    localStorage.setItem("accentColor", "violet");
    const { result } = renderHook(() => useAccentColor(), { wrapper });
    expect(result.current.accentColor).toBe("violet");
    expect(accentAttribute()).toBe("violet");
  });

  it("lets the server value override the local mirror", async () => {
    localStorage.setItem("accentColor", "blue");
    mocks.metadataValue = "emerald";
    const { result } = renderHook(() => useAccentColor(), { wrapper });
    await waitFor(() => {
      expect(result.current.accentColor).toBe("emerald");
    });
    expect(accentAttribute()).toBe("emerald");
    expect(localStorage.getItem("accentColor")).toBe("emerald");
  });

  it("applies immediately, persists to metadata and reports success", async () => {
    const { result } = renderHook(() => useAccentColor(), { wrapper });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.setAccentColor("rose");
    });
    expect(saved).toBe(true);
    expect(accentAttribute()).toBe("rose");
    expect(mocks.setUserMetadataFromClient).toHaveBeenCalledWith({
      key: ACCENT_COLOR_METADATA_KEY,
      value: "rose",
    });
    expect(mocks.mutateMetadata).toHaveBeenCalledWith(
      { metadata: { key: ACCENT_COLOR_METADATA_KEY, value: "rose" } },
      { revalidate: false }
    );
  });

  it("keeps the local choice but reports failure when the save fails", async () => {
    mocks.setUserMetadataFromClient.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAccentColor(), { wrapper });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.setAccentColor("lime");
    });
    expect(saved).toBe(false);
    expect(result.current.accentColor).toBe("lime");
    expect(mocks.mutateMetadata).not.toHaveBeenCalled();
  });
});
