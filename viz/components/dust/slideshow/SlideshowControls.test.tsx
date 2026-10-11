// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { getVizCatalog } from "@viz/app/lib/i18n/catalogs";
import { VizI18nProvider } from "@viz/app/lib/i18n/VizI18nProvider";
import { SlideshowControls } from "@viz/components/dust/slideshow/SlideshowControls";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
});

function renderControls() {
  return (
    <SlideshowControls
      activeIndex={1}
      total={3}
      onPrevious={() => {}}
      onNext={() => {}}
    />
  );
}

describe("SlideshowControls", () => {
  it("renders English labels by default", () => {
    render(renderControls());

    expect(screen.getByRole("button", { name: "Previous slide" })).toBeTruthy();
    expect(screen.getByLabelText("Slide 2 of 3")).toBeTruthy();
  });

  it("renders the frame locale's labels", () => {
    render(
      <VizI18nProvider catalog={getVizCatalog("fr-FR")}>
        {renderControls()}
      </VizI18nProvider>
    );

    expect(
      screen.getByRole("button", { name: "Diapositive précédente" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Diapositive 2 sur 3")).toBeTruthy();
  });
});
