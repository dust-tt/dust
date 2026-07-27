import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContentWidthType } from "./AppLayoutContext";
import {
  AppLayoutProvider,
  useAppLayout,
  useSetContentWidth,
} from "./AppLayoutContext";

function WidthReader() {
  const { contentWidth } = useAppLayout();
  return <div data-testid="width">{contentWidth ?? "undefined"}</div>;
}

function DeclareWidth({ value }: { value: ContentWidthType }) {
  useSetContentWidth(value);
  return null;
}

describe("AppLayoutContext", () => {
  it("exposes the declared contentWidth to readers", () => {
    render(
      <AppLayoutProvider>
        <DeclareWidth value="centered" />
        <WidthReader />
      </AppLayoutProvider>
    );
    expect(screen.getByTestId("width").textContent).toBe("centered");
  });

  it("accepts the full archetype", () => {
    render(
      <AppLayoutProvider>
        <DeclareWidth value="full" />
        <WidthReader />
      </AppLayoutProvider>
    );
    expect(screen.getByTestId("width").textContent).toBe("full");
  });

  it("resets to undefined when the declaring component unmounts", () => {
    const { rerender } = render(
      <AppLayoutProvider>
        <DeclareWidth value="wide" />
        <WidthReader />
      </AppLayoutProvider>
    );
    expect(screen.getByTestId("width").textContent).toBe("wide");

    rerender(
      <AppLayoutProvider>
        <WidthReader />
      </AppLayoutProvider>
    );
    expect(screen.getByTestId("width").textContent).toBe("undefined");
  });

  it("last declaring component wins when several are mounted", () => {
    render(
      <AppLayoutProvider>
        <DeclareWidth value="centered" />
        <DeclareWidth value="wide" />
        <WidthReader />
      </AppLayoutProvider>
    );
    expect(screen.getByTestId("width").textContent).toBe("wide");
  });
});
