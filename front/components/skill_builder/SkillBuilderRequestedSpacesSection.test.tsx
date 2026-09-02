import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import type { SkillSpaceRestrictionsContextType } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real sheet pulls in the whole space/pod picker. The stub keeps the contract the section
// depends on: it receives the draft selection, lets the test read it, and saves it back.
interface SpaceSelectionSheetStubProps {
  alreadyRequestedSpaceIds: Set<string>;
  onSave: () => void;
  open: boolean;
  selectedSpaces: string[];
}

vi.mock(
  "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage",
  () => ({
    SpaceSelectionSheet: ({
      alreadyRequestedSpaceIds,
      onSave,
      open,
      selectedSpaces,
    }: SpaceSelectionSheetStubProps) =>
      open ? (
        <div>
          <span data-testid="sheet-draft">{selectedSpaces.join(",")}</span>
          <span data-testid="sheet-locked">
            {[...alreadyRequestedSpaceIds].join(",")}
          </span>
          <button onClick={onSave}>Save spaces</button>
        </div>
      ) : null,
  })
);

vi.mock("@app/components/shared/SpaceChips", () => ({
  SpaceChips: () => null,
}));

vi.mock("@app/components/skill_builder/useRemoveSkillSpace", () => ({
  useRemoveSkillSpace: () => ({
    removeSpace: vi.fn(),
    isRemovalDisabled: false,
  }),
}));

let restrictionsContextMock: SkillSpaceRestrictionsContextType;

vi.mock("@app/components/skill_builder/SkillSpaceRestrictionsContext", () => ({
  useSkillSpaceRestrictionsContext: () => restrictionsContextMock,
}));

function makeRestrictionsContext(
  overrides: Partial<SkillSpaceRestrictionsContextType>
): SkillSpaceRestrictionsContextType {
  return {
    actionsBySpaceId: {},
    allSpaces: [],
    areSpaceRequirementsReady: true,
    editorsWithoutSpaceAccess: [],
    globalSpace: undefined,
    initialRequestedSpaceIds: undefined,
    knowledgeBySpaceId: {},
    missingSpaceIds: [],
    nonGlobalSpacesUsedBySkill: [],
    nonGlobalSpacesWithRestrictions: [],
    skillsBySpaceId: {},
    spaceIdsUsedBySkill: new Set<string>(),
    ...overrides,
  };
}

function AdditionalSpacesProbe() {
  const additionalSpaces = useWatch<SkillBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });

  return (
    <span data-testid="additional-spaces">
      {(additionalSpaces ?? []).join(",")}
    </span>
  );
}

function renderSection({ additionalSpaces }: { additionalSpaces: string[] }) {
  // Defined once per render call so a rerender keeps the same component type, and with it the
  // form state: the tests below need the field to survive a context change.
  function Wrapper() {
    const form = useForm<SkillBuilderFormData>({
      defaultValues: { additionalSpaces },
    });

    return (
      <FormProvider {...form}>
        <SkillBuilderRequestedSpacesSection />
        <AdditionalSpacesProbe />
      </FormProvider>
    );
  }

  const { rerender } = render(<Wrapper />);

  return { rerenderSection: () => rerender(<Wrapper />) };
}

describe("SkillBuilderRequestedSpacesSection", () => {
  beforeEach(() => {
    restrictionsContextMock = makeRestrictionsContext({});
  });

  it("keeps a manually selected space that knowledge also requires when the sheet is saved", async () => {
    // Space A was picked by hand and knowledge from Space A was attached afterwards, so the space
    // is both manually selected and automatically required.
    restrictionsContextMock = makeRestrictionsContext({
      spaceIdsUsedBySkill: new Set(["space-a"]),
    });

    renderSection({ additionalSpaces: ["space-a"] });

    await userEvent.click(screen.getByRole("button", { name: "Manage" }));

    // The draft must carry the space even though something else requires it too.
    expect(screen.getByTestId("sheet-draft")).toHaveTextContent("space-a");
    expect(screen.getByTestId("sheet-locked")).toHaveTextContent("space-a");

    await userEvent.click(screen.getByRole("button", { name: "Save spaces" }));

    expect(screen.getByTestId("additional-spaces")).toHaveTextContent(
      "space-a"
    );
  });

  it("does not turn an automatically required space into a manual selection", async () => {
    // Space B is only required by knowledge. The sheet renders it selected and locked, so saving
    // must not record it as a manual choice.
    restrictionsContextMock = makeRestrictionsContext({
      spaceIdsUsedBySkill: new Set(["space-b"]),
    });

    renderSection({ additionalSpaces: [] });

    await userEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(screen.getByTestId("sheet-draft")).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole("button", { name: "Save spaces" }));

    expect(screen.getByTestId("additional-spaces")).toBeEmptyDOMElement();
  });

  it("keeps a manual space after the knowledge that also required it is removed", async () => {
    // The reported flow: Space A is selected by hand and knowledge from Space A is attached, the
    // Manage screen is opened and saved, then the knowledge is removed.
    restrictionsContextMock = makeRestrictionsContext({
      spaceIdsUsedBySkill: new Set(["space-a"]),
    });

    const { rerenderSection } = renderSection({
      additionalSpaces: ["space-a"],
    });

    await userEvent.click(screen.getByRole("button", { name: "Manage" }));
    await userEvent.click(screen.getByRole("button", { name: "Save spaces" }));

    // The knowledge goes away, so nothing requires the space automatically any more. The manual
    // selection is what keeps it.
    restrictionsContextMock = makeRestrictionsContext({
      spaceIdsUsedBySkill: new Set<string>(),
    });
    rerenderSection();

    expect(screen.getByTestId("additional-spaces")).toHaveTextContent(
      "space-a"
    );

    // And it is still offered as a manual selection when the sheet is reopened.
    await userEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByTestId("sheet-draft")).toHaveTextContent("space-a");
  });

  it("keeps manual selections that nothing else requires", async () => {
    renderSection({ additionalSpaces: ["space-c"] });

    await userEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(screen.getByTestId("sheet-draft")).toHaveTextContent("space-c");

    await userEvent.click(screen.getByRole("button", { name: "Save spaces" }));

    expect(screen.getByTestId("additional-spaces")).toHaveTextContent(
      "space-c"
    );
  });
});
