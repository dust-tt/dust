import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { framesSkill } from "@app/lib/resources/skill/code_defined/global/frames";
import { sheetToFrameSkill } from "@app/lib/resources/skill/code_defined/global/sheet_to_frame";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const ENABLE_SKILL_TOOL = getPrefixedToolName(
  SKILL_MANAGEMENT_SERVER_NAME,
  ENABLE_SKILL_TOOL_NAME
);

describe("sheetToFrameSkill", () => {
  it("is registered as a global skill", () => {
    expect(GLOBAL_SKILLS_ARRAY).toContain(sheetToFrameSkill);
  });

  it("defers every Frame mechanic to the Frames skill", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain(ENABLE_SKILL_TOOL);
    expect(instructions).toContain(framesSkill.name);
    expect(instructions).toContain("Before reading the sheet");
    expect(instructions).toContain("deliberately does not restate them");
    // The Frame tooling and the linter ship with the Frames skill; duplicating its servers here
    // would hand out the tools without the instructions.
    expect(sheetToFrameSkill.mcpServers).toEqual([]);
  });

  it("makes the entered-versus-calculated split the pivot of the design", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain('valueRenderOption: "FORMULA"');
    expect(instructions).toContain('valueRenderOption: "FORMATTED_VALUE"');
    expect(instructions).toContain("xlsx_inspect");
    expect(instructions).toContain("**Calculated columns get no column.**");
    expect(instructions).toContain(
      "A stored total is the staleness the spreadsheet"
    );
    expect(instructions).toContain("snapshot that constant onto the row");
  });

  it("seeds the existing rows through an author-only idempotent import", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain('userIdentity: "frame_author_required"');
    expect(instructions).toContain(
      "dsbx frame call <frame-id> import-rows --input"
    );
    expect(instructions).toContain("sourceRowKey");
    expect(instructions).toContain("**The source sheet is read-only.**");
  });

  it("infers the date and the author instead of asking for them", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain("**Infer the obvious.**");
    expect(instructions).toContain("The date defaults to today");
    expect(instructions).toContain("useUserIdentity");
    expect(instructions).toContain("Neither is ever a form field");
    expect(instructions).toContain(
      "**Calculated fields render live and read-only**"
    );
  });

  it("covers deletion and sorting", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain("`delete-row`");
    expect(instructions).toContain("a hidden button is not access control");
    expect(instructions).toContain(
      "**Sortable columns where sorting means something**"
    );
  });

  it("asks the user only what the sheet cannot answer", () => {
    const { instructions } = sheetToFrameSkill;

    expect(instructions).toContain("Batch your questions into one message");
    expect(instructions).toContain("Do not ask which columns are calculated");
  });

  it("is restricted without the frames_v2 flag", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await expect(sheetToFrameSkill.isRestricted(auth)).resolves.toBe(true);
    await expect(
      sheetToFrameSkill.warmsConversationSandbox(auth)
    ).resolves.toBe(false);
  });

  it("is available and warms the Computer with the frames_v2 flag", async () => {
    const { authenticator: auth } = await createResourceTest({});
    await FeatureFlagFactory.basic(auth, "frames_v2");

    await expect(sheetToFrameSkill.isRestricted(auth)).resolves.toBe(false);
    await expect(
      sheetToFrameSkill.warmsConversationSandbox(auth)
    ).resolves.toBe(true);
  });
});
