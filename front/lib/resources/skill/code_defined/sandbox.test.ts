import { Authenticator } from "@app/lib/auth";
import { sandboxSkill } from "@app/lib/resources/skill/code_defined/sandbox";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("sandboxSkill", () => {
  it("includes dsbx tools instructions and manifest entry when sandbox is enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("dsbx tools");
    expect(instructions).toContain("name: dsbx");
  });

  it("hides dsbx tools instructions and manifest entry when computer is disabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).not.toContain("dsbx tools");
    expect(instructions).not.toContain("name: dsbx");
  });

  it("instructs the model to analyze mounted tabular files with code", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructions = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(instructions).toContain("tabular files (CSV, TSV, Excel)");
    expect(instructions).toContain("pandas.read_csv");
    expect(instructions).toContain("DuckDB");
  });

  it("documents DSEC HTTPS secret handling and trust-store footguns", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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
