import { readPackageUpSync } from "read-pkg-up";
import { expect, it } from "vitest";

const MESSAGE = `
You upgraded tiptap, that's cool of you thanks a lot! 

Could you please check that we still need the:
1. EmptyLineParagraphExtension 

For 1) look here https://github.com/ueberdosis/tiptap/issues/7269
`;

it("should fail when upgrading tiptap", () => {
  const result = readPackageUpSync({
    cwd: require.resolve("@tiptap/core"),
  });

  expect(result?.packageJson.version, MESSAGE).toEqual("3.13.0");
});
