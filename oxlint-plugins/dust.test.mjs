import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OXLINT = resolve(HERE, "../node_modules/.bin/oxlint");
const PLUGIN = join(HERE, "dust.mjs");

const BYPASS = "dangerouslyBypassWorkspaceIsolationSecurity";

// [rule, file, code, expected diagnostics]
const CASES = [
  [
    "noUnusedReactImport",
    "a.tsx",
    `import React from "react";\nexport const a = <div />;`,
    1,
  ],
  [
    "noUnusedReactImport",
    "b.tsx",
    `import React from "react";\nexport const a = React.createElement("div");`,
    0,
  ],
  [
    "noUnusedReactImport",
    "c.tsx",
    `import { useState } from "react";\nexport const a = useState;`,
    0,
  ],
  [
    "noUnusedReactImport",
    "sparkle/d.tsx",
    `import React from "react";\nexport const a = <div />;`,
    0,
  ],
  [
    "noUnusedReactImport",
    "cli/dust-cli/e.tsx",
    `import React from "react";\nexport const a = <div />;`,
    0,
  ],
  ["noRawSql", "a.ts", "frontSequelize.query(sql);", 1],
  ["noRawSql", "b.ts", "getFrontReplicaDbConnection().query<Row>(sql);", 1],
  ["noRawSql", "c.ts", "connectorsDb.query(sql);", 1],
  ["noRawSql", "d.ts", "user.query(sql);", 0],
  ["noUnverifiedWorkspaceBypass", "a.ts", `f({ ${BYPASS}: true });`, 1],
  ["noUnverifiedWorkspaceBypass", "b.ts", `f({ ${BYPASS}: false });`, 0],
  ["noExpensiveConversationFetch", "a.ts", "getConversation(auth, id);", 1],
  [
    "noExpensiveConversationFetch",
    "b.ts",
    "ConversationResource.fetchConversationWithParticipantState(a);",
    1,
  ],
  [
    "noExpensiveConversationFetch",
    "c.ts",
    "ConversationResource.fetchById(a);",
    0,
  ],
  [
    "enforceClientTypesInPublicApi",
    "lib/a.ts",
    `import { X } from "@dust-tt/client";`,
    1,
  ],
  [
    "enforceClientTypesInPublicApi",
    "lib/b.ts",
    `import { X } from "@dust-tt/client/src/x";`,
    1,
  ],
  [
    "enforceClientTypesInPublicApi",
    "pages/api/v1/a.ts",
    `import { X } from "@dust-tt/client";`,
    0,
  ],
  [
    "enforceClientTypesInPublicApi",
    "lib/c.test.ts",
    `import { X } from "@dust-tt/client";`,
    0,
  ],
  ["noCssImportant", "a.tsx", `const s = "color: red !important";`, 1],
  ["noCssImportant", "b.tsx", `const c = "text-foreground!";`, 1],
  ["noCssImportant", "c.tsx", `const s = "Hello!";`, 0],
  ["noBulkLodash", "a.ts", `import { debounce } from "lodash";`, 1],
  ["noBulkLodash", "b.ts", `import debounce from "lodash/debounce";`, 0],
  [
    "noDirectSparkleNotification",
    "a.ts",
    `import { useSendNotification } from "@dust-tt/sparkle";`,
    1,
  ],
  [
    "noDirectSparkleNotification",
    "b.ts",
    `import { useSendNotification as w } from "@dust-tt/sparkle";`,
    0,
  ],
  [
    "noClientDeepImports",
    "a.ts",
    `import { X } from "@dust-tt/client/src";`,
    1,
  ],
  ["noClientDeepImports", "b.ts", `import { X } from "@dust-tt/client";`, 0],
  ["noLocaleLessDateTimeFormat", "a.ts", "d.toLocaleDateString();", 1],
  [
    "noLocaleLessDateTimeFormat",
    "b.ts",
    "d.toLocaleTimeString(undefined, o);",
    1,
  ],
  ["noLocaleLessDateTimeFormat", "c.ts", `d.toLocaleDateString("fr");`, 0],
  ["noLocaleLessToLocaleString", "a.ts", "n.toLocaleString();", 1],
  ["noLocaleLessToLocaleString", "b.ts", "n?.toLocaleString(undefined, o);", 1],
  ["noLocaleLessToLocaleString", "c.ts", `n.toLocaleString("fr");`, 0],
  ["noSparkleToLocaleFormat", "a.ts", "d.toLocaleDateString();", 1],
  ["noSparkleToLocaleFormat", "b.ts", `n?.toLocaleString("fr");`, 1],
  ["noSparkleToLocaleFormat", "c.ts", "formatNumber(n, undefined, l);", 0],
  ["noBareLocaleCompare", "a.ts", "a.localeCompare(b);", 1],
  ["noBareLocaleCompare", "b.ts", "compareStrings(a, b);", 0],
  ["noHardcodedEnUsLocale", "a.ts", `const l = "en-US";`, 1],
  ["noHardcodedEnUsLocale", "b.ts", `const l = "fr-FR";`, 0],
  [
    "noClientImportsInServer",
    "a.ts",
    `import { C } from "@app/components/Foo";`,
    1,
  ],
  [
    "noClientImportsInServer",
    "b.ts",
    `import * as S from "@dust-tt/sparkle";`,
    1,
  ],
  [
    "noClientImportsInServer",
    "c.ts",
    `import type { C } from "@app/components/Foo";`,
    0,
  ],
  [
    "noClientImportsInServer",
    "d.ts",
    `import { N } from "@app/components/editor/extensions/node";`,
    0,
  ],
  [
    "noClientImportsInServer",
    "e.ts",
    `import { loadDfm } from "@app/components/editor/document/dfm_persistence";`,
    0,
  ],
  [
    "noClientImportsInServer",
    "f.ts",
    `import { Document } from "@app/components/editor/document/Document";`,
    1,
  ],
  ["noNextImports", "a.ts", `import Head from "next/head";`, 1],
  [
    "noNextImports",
    "b.ts",
    `import type { NextRequest } from "next/server";`,
    1,
  ],
  ["noNextImports", "c.ts", `import React from "react";`, 0],
  [
    "noSparkleClassInFront",
    "a.tsx",
    `const a = <div className="s-flex" />;`,
    1,
  ],
  [
    "noSparkleClassInFront",
    "b.tsx",
    `const a = <div className="flex s-gap-2" />;`,
    1,
  ],
  ["noSparkleClassInFront", "c.tsx", `const a = <div className="flex" />;`, 0],
  ["noStringConcatInJsx", "a.tsx", `const a = <p>{"Hi " + name}</p>;`, 1],
  ["noStringConcatInJsx", "b.tsx", `const a = <p title={name + \`!\`} />;`, 1],
  ["noStringConcatInJsx", "c.tsx", `const s = "Hi " + name;`, 0],
  ["noStringConcatInJsx", "d.tsx", `const a = <p>{a + b}</p>;`, 0],
  ["noRawErrorMessageInUi", "a.ts", "f(err.error.message);", 1],
  ["noRawErrorMessageInUi", "b.ts", "f(res.error?.message);", 1],
  ["noRawErrorMessageInUi", "c.ts", "f(fieldState.error.message);", 0],
  ["noRawErrorMessageInUi", "d.ts", "f(err.message);", 0],
  [
    "noRawErrorMessageInUi",
    "e.ts",
    "datadogLogger.error({ error: res.error.message }, 'Failed');",
    0,
  ],
  ["noRawErrorMessageInUi", "f.ts", "logger.warn(res.error.message);", 0],
  [
    "noRawErrorMessageInUi",
    "g.ts",
    "logger.warn('Failed'); toast(res.error.message);",
    1,
  ],
  [
    "tooLongIndexName",
    "a.ts",
    `X.init({}, { modelName: "${"a".repeat(45)}" });`,
    1,
  ],
  ["tooLongIndexName", "b.ts", `X.init({}, { modelName: "short" });`, 0],
  [
    "noSequelizeDataTypesImport",
    "a.ts",
    `import { DataTypes, Model } from "sequelize";`,
    1,
  ],
  [
    "noSequelizeDataTypesImport",
    "b.ts",
    `import { Model } from "sequelize";`,
    0,
  ],
  ["noInlineSuccessResponseBody", "a.ts", "type R = { success: true };", 1],
  [
    "noInlineSuccessResponseBody",
    "b.ts",
    "export type R = { success: true; };",
    1,
  ],
  [
    "noInlineSuccessResponseBody",
    "c.ts",
    "type R = { success: true; id: string };",
    0,
  ],
  ["noDirectRoleCheck", "a.ts", "if (auth.isAdmin()) { run(); }", 1],
  [
    "noDirectRoleCheck",
    "b.ts",
    "if (auth.isAdmin() || r.canEdit(auth)) { run(); }",
    0,
  ],
  ["noDirectRoleCheck", "c.ts", "const ok = auth.isAdmin();", 0],
  [
    "nextjsPageComponentNaming",
    "pages/a.tsx",
    "export default function Home() { return null; }",
    1,
  ],
  [
    "nextjsPageComponentNaming",
    "pages/b.tsx",
    "export default function HomeNextJS() { return null; }",
    0,
  ],
  [
    "nextjsPageComponentNaming",
    "lib/c.tsx",
    "export default function Home() { return null; }",
    0,
  ],
];

const root = mkdtempSync(join(tmpdir(), "dust-oxlint-plugin-"));
after(() => rmSync(root, { recursive: true, force: true }));

const rules = [...new Set(CASES.map(([rule]) => rule))];
writeFileSync(
  join(root, ".oxlintrc.json"),
  JSON.stringify({
    categories: { correctness: "off" },
    jsPlugins: [PLUGIN],
    rules: Object.fromEntries(rules.map((rule) => [`dust/${rule}`, "error"])),
  })
);

CASES.forEach(([rule, file, code], i) => {
  const path = join(root, `case${i}`, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, code);
});

let output = "";
try {
  output = execFileSync(OXLINT, ["-c", ".oxlintrc.json", "-f", "json", "."], {
    cwd: root,
    encoding: "utf8",
  });
} catch (e) {
  output = e.stdout;
}
const diagnostics = JSON.parse(output).diagnostics;

describe("dust oxlint plugin", () => {
  CASES.forEach(([rule, file, code, expected], i) => {
    it(`${rule}: ${expected ? "flags" : "ignores"} ${code}`, () => {
      const found = diagnostics.filter(
        (d) => d.filename.startsWith(`case${i}/`) && d.code === `dust(${rule})`
      );
      assert.equal(found.length, expected);
    });
  });
});
