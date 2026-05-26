import { Authenticator } from "@app/lib/auth";
import { sandboxSkill } from "@app/lib/resources/skill/code_defined/sandbox";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("sandboxSkill", () => {
  it("hides dsbx tools instructions and manifest entry until enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const instructionsWithoutDsbxTools = await sandboxSkill.fetchInstructions(
      auth,
      { spaceIds: [] }
    );

    expect(instructionsWithoutDsbxTools).not.toContain("dsbx tools");
    expect(instructionsWithoutDsbxTools).not.toContain("name: dsbx");

    await FeatureFlagFactory.basic(auth, "sandbox_dsbx_tools");

    const instructionsWithDsbxTools = await sandboxSkill.fetchInstructions(
      auth,
      { spaceIds: [] }
    );

    expect(instructionsWithDsbxTools).toContain("dsbx tools");
    expect(instructionsWithDsbxTools).toContain("name: dsbx");
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

  it("points at `dsbx env` for env-var discovery only when dsbx tools are enabled", async () => {
    const { authenticator: auth } = await createResourceTest({});

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const withoutDsbxTools = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(withoutDsbxTools).not.toContain("dsbx env");

    await FeatureFlagFactory.basic(auth, "sandbox_dsbx_tools");

    const withDsbxTools = await sandboxSkill.fetchInstructions(auth, {
      spaceIds: [],
    });

    expect(withDsbxTools).toContain("`dsbx env`");
    expect(withDsbxTools).toContain("the HTTPS domain(s) it is approved for");
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
    await FeatureFlagFactory.basic(refreshedAuth, "sandbox_workspace_admin");

    const permissiveInstructions = await sandboxSkill.fetchInstructions(
      refreshedAuth,
      { spaceIds: [] }
    );

    expect(permissiveInstructions).toContain("add_egress_domain");
    expect(permissiveInstructions).toContain("Sandbox allowlist");
  });
});
