// @vitest-environment jsdom
import { CookieBanner } from "@marketing/components/home/CookieBanner";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Sparkle pulls in lottie-web, which needs a real canvas. The banner logic only
// needs a clickable labelled button; variant and size are exposed to compare prominence.
vi.mock("@dust-tt/sparkle", () => ({
  Button: ({
    label,
    onClick,
    variant,
    size,
    className,
  }: {
    label: string;
    onClick: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button
      type="button"
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
    >
      {label}
    </button>
  ),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("@marketing/components/home/ContentComponents", () => ({
  A: ({ children, href }: { children: React.ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const NO_CHOICES = { analytics: false, replay: false };

function renderBanner(
  mode: "first-visit" | "settings",
  savedChoices = NO_CHOICES
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <CookieBanner
      mode={mode}
      savedChoices={savedChoices}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
  return { onSave, onCancel };
}

function button(name: string) {
  return screen.getByRole("button", { name });
}

function replayCheckbox() {
  return screen.getByRole("checkbox", { name: "Session replay" });
}

function analyticsCheckbox() {
  return screen.getByRole("checkbox", { name: "Analytics cookies" });
}

function checked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement && element.checked;
}

afterEach(() => {
  cleanup();
});

describe("CookieBanner first-visit summary", () => {
  it("does not show a replay checkbox on the first banner", () => {
    renderBanner("first-visit");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("Accept all saves consent for both analytics and replay", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Accept all"));
    expect(onSave).toHaveBeenCalledWith({ analytics: true, replay: true });
  });

  it("Reject all rejects both", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Reject all"));
    expect(onSave).toHaveBeenCalledWith({ analytics: false, replay: false });
  });

  it("gives Accept all and Reject all the same height", () => {
    renderBanner("first-visit");
    const accept = button("Accept all");
    const reject = button("Reject all");
    const heightClasses = (el: HTMLElement) =>
      el.className.split(" ").filter((c) => /(^|:)h-/.test(c));
    expect(reject.dataset.size).toBe(accept.dataset.size);
    expect(heightClasses(reject)).toStrictEqual(heightClasses(accept));
    expect(heightClasses(accept).length).toBeGreaterThan(0);
  });

  it("orders the actions Reject all, Customise, Accept all", () => {
    renderBanner("first-visit");
    expect(
      screen.getAllByRole("button").map((b) => b.textContent)
    ).toStrictEqual(["Reject all", "Customise", "Accept all"]);
  });

  it("previous analytics consent does not pre-select replay", () => {
    renderBanner("first-visit", { analytics: true, replay: false });
    fireEvent.click(button("Customise"));
    expect(checked(analyticsCheckbox())).toBe(true);
    expect(checked(replayCheckbox())).toBe(false);
  });
});

describe("CookieBanner Customise", () => {
  it("opens separate choices, both off by default", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    expect(checked(analyticsCheckbox())).toBe(false);
    expect(checked(replayCheckbox())).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saving without changes accepts nothing", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    fireEvent.click(button("Save preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: false, replay: false });
  });

  it("allows analytics without replay", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    fireEvent.click(analyticsCheckbox());
    fireEvent.click(button("Save preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: true, replay: false });
  });

  it("requires analytics before replay can be chosen", () => {
    renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    expect(replayCheckbox()).toHaveProperty("disabled", true);
  });

  it("saves replay only when explicitly ticked", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    fireEvent.click(analyticsCheckbox());
    fireEvent.click(replayCheckbox());
    fireEvent.click(button("Save preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: true, replay: true });
  });

  it("Back returns to the summary without saving", () => {
    const { onSave } = renderBanner("first-visit");
    fireEvent.click(button("Customise"));
    fireEvent.click(button("Back"));
    expect(button("Accept all")).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("CookieBanner Cookie Settings", () => {
  it("opens straight on the choices and can be cancelled", () => {
    const { onCancel, onSave } = renderBanner("settings");
    expect(screen.queryByRole("button", { name: "Accept all" })).toBeNull();
    fireEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("lets the visitor withdraw replay consent while keeping analytics", () => {
    const { onSave } = renderBanner("settings", {
      analytics: true,
      replay: true,
    });
    expect(checked(replayCheckbox())).toBe(true);
    fireEvent.click(replayCheckbox());
    fireEvent.click(button("Save preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: true, replay: false });
  });

  it("turning analytics off also withdraws replay", () => {
    const { onSave } = renderBanner("settings", {
      analytics: true,
      replay: true,
    });
    fireEvent.click(analyticsCheckbox());
    fireEvent.click(button("Save preferences"));
    expect(onSave).toHaveBeenCalledWith({ analytics: false, replay: false });
  });
});
