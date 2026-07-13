import { Authenticator } from "@app/lib/auth";
import { sandboxSkill } from "@app/lib/resources/skill/code_defined/global/sandbox";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("sandboxSkill", () => {
  it("inlines a compact toolset and points to detailed help", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("dsbx tools");
    expect(instructions).toContain("- System: git, curl");
    expect(instructions).toContain("- Python: python, pandas 3.0.1");
    expect(instructions).toContain("- Node: typescript, tsx");
    expect(instructions).toContain("`describe_toolset`");
    const systemTools = instructions
      .split("\n")
      .find((line) => line.startsWith("- System:"));
    expect(systemTools).toBeDefined();
    expect(systemTools).not.toContain("xlsx_inspect");
    expect(systemTools).not.toContain("pptx_inspect");
    expect(systemTools).not.toContain("docx_inspect");
    expect(systemTools).not.toContain("pptx_slides");
    expect(instructions).toContain(
      "Dust-specific Office helpers (not standard Linux commands)"
    );
    expect(instructions).toContain(
      "- `xlsx_inspect`: Inspect workbook sheets, ranges, formulas"
    );
    expect(instructions).toContain(
      "- `pptx_inspect`: Inspect and QA deck structure"
    );
    expect(instructions).toContain(
      "- `docx_inspect`: Inspect document structure, styles"
    );
    expect(instructions).toContain(
      "- `pptx_slides`: Safely duplicate, move, or delete slides"
    );
    expect(instructions).toContain("`<command> --help`");
    expect(instructions).not.toContain("name: dsbx");
    expect(instructions).not.toContain("```yaml");
  });

  it("hides dsbx tools instructions when computer is disabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "disable_computer_feature");

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain("dsbx tools");
    const systemTools = instructions
      .split("\n")
      .find((line) => line.startsWith("- System:"));
    expect(systemTools).toBeDefined();
    expect(systemTools).not.toContain("dsbx");
  });

  it("instructs the model to analyze mounted tabular files with code", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("tabular files (CSV, TSV, Excel)");
    expect(instructions).toContain("pandas.read_csv");
    expect(instructions).toContain("DuckDB");
  });

  it("documents DSEC HTTPS secret handling and trust-store footguns", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("`DST_*`: configuration values");
    expect(instructions).toContain("`DSEC_*`: HTTPS secret placeholders");
    expect(instructions).toContain("Authorization: Basic");
    expect(instructions).toContain(
      "Do not put a `DSEC_*` placeholder in a URL or query string"
    );
    expect(instructions).toContain(
      'os.environ["OPENAI_API_KEY"] = os.environ["DSEC_OPENAI_API_KEY"]'
    );
    expect(instructions).toContain("rustls-tls-native-roots");
    expect(instructions).toContain("PKIX path building failed");
    expect(instructions).toContain("Do not pass custom TLS trust settings");
  });

  it("points at `dsbx env` for env-var discovery", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("`dsbx env`");
    expect(instructions).toContain("the HTTPS domain(s) it is approved for");
  });

  it("hides agent egress request instructions until enabled", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({});

    const restrictedInstructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(restrictedInstructions).toContain("There is **no** way to add");
    expect(restrictedInstructions).not.toContain("add_egress_domain");

    await WorkspaceResource.updateMetadata(workspace.id, {
      sandboxAllowAgentEgressRequests: true,
    });
    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const permissiveInstructions = await sandboxSkill.fetchInstructions(
      refreshedAuth,
      { spaceIds: [] }
    );

    expect(permissiveInstructions).toContain("add_egress_domain");
    expect(permissiveInstructions).toContain("Sandbox allowlist");
  });
});
