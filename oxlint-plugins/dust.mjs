const RAW_SQL_OBJ_EXACT = new Set([
  "frontSequelize",
  "getFrontReplicaDbConnection()",
  "getConnectorsPrimaryDbConnection()",
]);
const RAW_SQL_OBJ_REGEX = [
  /^.*[Ss]equelize.*$/s,
  /^.*[Rr]eplica.*$/s,
  /^.*Db$/s,
];

const CLIENT_IMPORT = /^@dust-tt\/client(\/.+)?$/;
const CLIENT_IMPORT_ALLOWED_PATHS = [
  /pages\/api\/v1\//,
  /\/front-api\/routes\/v1\//,
  /\/front-api\/routes\/sse\/v1\//,
  /lib\/actions\/mcp_internal_actions\//,
  /lib\/api\/actions\/servers\//,
  /\.test\./,
];

const CSS_IMPORTANT =
  /(?:"[^"]*(?:!important|[a-z0-9]-[a-z0-9!-]*!)[^"]*"|'[^']*(?:!important|[a-z0-9]-[a-z0-9!-]*!)[^']*'|`[^`]*(?:!important|[a-z0-9]-[a-z0-9!-]*!)[^`]*`)/;

const noRawSql = {
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.name !== "query"
        ) {
          return;
        }
        const objText = context.sourceCode.getText(callee.object);
        if (
          RAW_SQL_OBJ_EXACT.has(objText) ||
          RAW_SQL_OBJ_REGEX.some((re) => re.test(objText))
        ) {
          context.report({
            node,
            message:
              "Raw SQL queries are not allowed. Use Sequelize models and methods instead.",
          });
        }
      },
    };
  },
};

const noUnverifiedWorkspaceBypass = {
  create(context) {
    return {
      Property(node) {
        const key = node.key;
        const name = key.type === "Identifier" ? key.name : key.value;
        if (
          name === "dangerouslyBypassWorkspaceIsolationSecurity" &&
          node.value.type === "Literal" &&
          node.value.value === true
        ) {
          context.report({
            node,
            message:
              "Usage of dangerouslyBypassWorkspaceIsolationSecurity requires a preceding comment starting with 'WORKSPACE_ISOLATION_BYPASS:' explaining the security bypass.",
          });
        }
      },
    };
  },
};

const noExpensiveConversationFetch = {
  create(context) {
    return {
      CallExpression(node) {
        const c = node.callee;
        const expensive =
          (c.type === "Identifier" &&
            (c.name === "getConversation" ||
              c.name === "getLightConversation")) ||
          (c.type === "MemberExpression" &&
            !c.computed &&
            c.object.type === "Identifier" &&
            c.object.name === "ConversationResource" &&
            c.property.name === "fetchConversationWithParticipantState");
        if (expensive) {
          context.report({
            node,
            message:
              "Avoid getConversation/getLightConversation/ConversationResource.fetchConversationWithParticipantState unless needed. Prefer ConversationResource.fetchById when message content and participation fields are not required.",
          });
        }
      },
    };
  },
};

const enforceClientTypesInPublicApi = {
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (CLIENT_IMPORT_ALLOWED_PATHS.some((re) => re.test(filename))) {
      return {};
    }
    return {
      Literal(node) {
        if (typeof node.value === "string" && CLIENT_IMPORT.test(node.value)) {
          context.report({
            node,
            message:
              "Files outside front/api/v1/, front-api/routes/v1/, front/lib/actions/mcp_internal_actions/ or front/lib/api/actions/servers/ cannot import from '@dust-tt/client'.",
          });
        }
      },
    };
  },
};

const noCssImportant = {
  create(context) {
    const check = (node) => {
      const text = context.sourceCode.getText(node);
      if (text.includes("!") && CSS_IMPORTANT.test(text)) {
        context.report({
          node,
          message:
            "Avoid `!important` in CSS (CONTRACTS [no-css-important]). Fix the specificity issue instead.",
        });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") {
          check(node);
        }
      },
      TemplateLiteral: check,
    };
  },
};

const NEXT_SOURCES = new Set([
  "next",
  "next/app",
  "next/document",
  "next/dynamic",
  "next/font/google",
  "next/font/local",
  "next/head",
  "next/image",
  "next/link",
  "next/navigation",
  "next/router",
  "next/script",
  "next/server",
]);

const CLIENT_ONLY_SOURCES = [
  /^@app\/components\/.+/,
  /^@app\/hooks\/.+/,
  /^@app\/pages\/.+/,
  /^@app\/lib\/client\/.+/,
  /^@app\/lib\/swr\/.+/,
  /^@app\/lib\/tracking$/,
  /^@app\/lib\/utils\/utm_client$/,
  /^@app\/logger\/datadogLogger$/,
  /^@dust-tt\/sparkle(\/.+)?$/,
  /^@lingui\/.+/,
];
// The document model's entry points run in Node, pinned by the document-model-runs-without-dom
// contract in front/components/editor/document/CONTRACTS.
const SERVER_SAFE_CLIENT_SOURCES =
  /@app\/components\/editor\/(extensions\/|document\/(content|dfm_persistence|DocumentComments)$)/;

const ROLE_CHECKS = new Set([
  "isAdmin",
  "isManager",
  "isUser",
  "isDustSuperUser",
]);
const SPARKLE_CLASS = /^"(?:s-|[^"]*\ss-)[^"]*"$/;

const isStringLike = (n) =>
  n.type === "TemplateLiteral" ||
  (n.type === "Literal" && typeof n.value === "string");
const isUndefined = (n) => n.type === "Identifier" && n.name === "undefined";
const memberName = (callee) =>
  callee.type === "MemberExpression" && !callee.computed
    ? callee.property.name
    : undefined;

const report = (context, node, message) => context.report({ node, message });

const importSourceRule = (matches, message) => ({
  create(context) {
    return {
      ImportDeclaration(node) {
        if (matches(node.source.value, node)) {
          report(context, node, message);
        }
      },
    };
  },
});

const literalRule = (matches, message) => ({
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && matches(node.value)) {
          report(context, node, message);
        }
      },
    };
  },
});

const noBulkLodash = literalRule(
  (v) => v === "lodash",
  "Bulk lodash imports increase bundle size (~70KB). Use individual imports instead (e.g., import debounce from 'lodash/debounce')."
);

const noDirectSparkleNotification = importSourceRule(
  (source, node) =>
    source === "@dust-tt/sparkle" &&
    node.importKind !== "type" &&
    node.specifiers.length === 1 &&
    node.specifiers[0].type === "ImportSpecifier" &&
    node.specifiers[0].imported.name === "useSendNotification" &&
    node.specifiers[0].local.name === "useSendNotification",
  "Avoid importing useSendNotification from @dust-tt/sparkle. Use 'import { useSendNotification } from \"@app/hooks/useNotification\"' instead."
);

const noClientDeepImports = literalRule(
  (v) => /^@dust-tt\/client\/.+/.test(v),
  "Deep imports from '@dust-tt/client/*' are not allowed. Import from '@dust-tt/client' instead."
);

const noLocaleLessDateTimeFormat = {
  create(context) {
    return {
      CallExpression(node) {
        const name = memberName(node.callee);
        if (
          (name !== "toLocaleDateString" && name !== "toLocaleTimeString") ||
          node.callee.optional ||
          node.arguments.length > 2 ||
          (node.arguments.length > 0 && !isUndefined(node.arguments[0]))
        ) {
          return;
        }
        report(
          context,
          node,
          "Date and time calls without a locale format in the browser's locale. Use `formatDate` or `formatTime` from `@app/lib/i18n/format` instead."
        );
      },
    };
  },
};

const noLocaleLessToLocaleString = {
  create(context) {
    return {
      CallExpression(node) {
        if (
          memberName(node.callee) !== "toLocaleString" ||
          node.arguments.length > 2 ||
          (node.arguments.length > 0 && !isUndefined(node.arguments[0]))
        ) {
          return;
        }
        report(
          context,
          node,
          "`toLocaleString` calls without a locale format in the browser's locale. Use `formatNumber` or `formatDateTime` from `@app/lib/i18n/format` instead."
        );
      },
    };
  },
};

const TO_LOCALE_METHODS = new Set([
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
]);

const noSparkleToLocaleFormat = {
  create(context) {
    return {
      CallExpression(node) {
        if (!TO_LOCALE_METHODS.has(memberName(node.callee))) {
          return;
        }
        report(
          context,
          node,
          "`toLocale*` calls ignore the format locale of `SparkleI18nProvider`. Use the functions of `@sparkle/lib/i18n/format` with `useFormatLocale()` instead (see sparkle/src/CONTRACTS)."
        );
      },
    };
  },
};

const noBareLocaleCompare = {
  create(context) {
    return {
      CallExpression(node) {
        if (memberName(node.callee) === "localeCompare") {
          report(
            context,
            node,
            "`localeCompare` compares in the browser's locale. Use `compareStrings` from `@app/lib/i18n/format` instead."
          );
        }
      },
    };
  },
};

const noHardcodedEnUsLocale = literalRule(
  (v) => v === "en-US",
  'The `"en-US"` literal pins formatting to US conventions. Use the functions of `@app/lib/i18n/format` without a locale, or with `getActiveLocale()` for dates with month or weekday names.'
);

const noClientImportsInServer = importSourceRule(
  (source, node) =>
    node.importKind !== "type" &&
    CLIENT_ONLY_SOURCES.some((re) => re.test(source)) &&
    !SERVER_SAFE_CLIENT_SOURCES.test(source),
  "This server-side module value-imports client-only code. Move the shared runtime value to a server-safe `@app/lib/...` module, or use `import type` when importing only a type."
);

const noNextImports = importSourceRule(
  (source) => NEXT_SOURCES.has(source),
  "Direct import from 'next' or 'next/*' is not allowed in shared code. Use platform abstractions from '@app/lib/platform' instead."
);

const noSparkleClassInFront = {
  create(context) {
    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          SPARKLE_CLASS.test(context.sourceCode.getText(node))
        ) {
          report(
            context,
            node,
            "className values with 's-' prefix are not allowed in front. These are reserved for sparkle components."
          );
        }
      },
    };
  },
};

const noStringConcatInJsx = {
  create(context) {
    let jsxExpressionDepth = 0;
    return {
      JSXExpressionContainer() {
        jsxExpressionDepth++;
      },
      "JSXExpressionContainer:exit"() {
        jsxExpressionDepth--;
      },
      BinaryExpression(node) {
        if (
          jsxExpressionDepth > 0 &&
          node.operator === "+" &&
          (isStringLike(node.left) || isStringLike(node.right))
        ) {
          report(
            context,
            node,
            "Avoid building text with `+` in JSX (CONTRACTS [ui-text-not-concatenated]). Use a single string or template literal instead."
          );
        }
      },
    };
  },
};

// See [ui-errors-through-format-error] in front/CONTRACTS. `<...State>.error.message` is a
// react-hook-form field error, built on the client, so it is not flagged. Neither are arguments of
// logger calls (`logger.error(...)`, `datadogLogger.warn(...)`), which are not shown to users.
const noRawErrorMessageInUi = {
  create(context) {
    const isLoggerCall = (node) =>
      node.callee.type === "MemberExpression" &&
      /logger$/i.test(context.sourceCode.getText(node.callee.object));
    let loggerCallDepth = 0;
    return {
      CallExpression(node) {
        if (isLoggerCall(node)) {
          loggerCallDepth++;
        }
      },
      "CallExpression:exit"(node) {
        if (isLoggerCall(node)) {
          loggerCallDepth--;
        }
      },
      MemberExpression(node) {
        const errorAccess = node.object;
        if (
          loggerCallDepth > 0 ||
          memberName(node) !== "message" ||
          memberName(errorAccess) !== "error" ||
          /State$/.test(context.sourceCode.getText(errorAccess.object))
        ) {
          return;
        }
        report(
          context,
          node,
          "Don't show `error.message` directly: use `useSendApiErrorNotification` from @app/hooks/useNotification, or `formatError` from @app/lib/api_error_messages (CONTRACTS [ui-errors-through-format-error])."
        );
      },
    };
  },
};

const tooLongIndexName = {
  create(context) {
    return {
      Property(node) {
        const name =
          node.key.type === "Identifier" ? node.key.name : node.key.value;
        if (
          name === "modelName" &&
          context.sourceCode.getText(node.value).length >= 42
        ) {
          report(
            context,
            node,
            "Ensure Sequelize index names don't exceed PostgreSQL's 63-character limit. Auto-generated names follow the pattern: {modelName}s_{field1}_{field2}."
          );
        }
      },
    };
  },
};

const noSequelizeDataTypesImport = {
  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          node.source.value === "sequelize" &&
          node.specifiers.some(
            (s) =>
              s.type === "ImportSpecifier" && s.imported.name === "DataTypes"
          )
        ) {
          report(
            context,
            node,
            "Do not import DataTypes from 'sequelize' directly. Use DataTypes (and DANGEROUSLY_UNBOUNDED_TEXT if needed) from '@app/lib/resources/storage/data_types' instead."
          );
        }
      },
    };
  },
};

const noInlineSuccessResponseBody = {
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        const t = node.typeAnnotation;
        if (t.type !== "TSTypeLiteral" || t.members.length !== 1) {
          return;
        }
        const m = t.members[0];
        const ann = m.typeAnnotation?.typeAnnotation;
        if (
          m.type === "TSPropertySignature" &&
          m.key.name === "success" &&
          ann?.type === "TSLiteralType" &&
          ann.literal.value === true
        ) {
          report(
            context,
            node,
            "Do not define inline `{ success: true }` types. Use `SuccessResponseBody` from `@front-api/routes/types` instead."
          );
        }
      },
    };
  },
};

const noDirectRoleCheck = {
  create(context) {
    return {
      CallExpression(node) {
        const c = node.callee;
        if (
          c.type !== "MemberExpression" ||
          c.computed ||
          c.object.type !== "Identifier" ||
          c.object.name !== "auth" ||
          !ROLE_CHECKS.has(c.property.name) ||
          node.arguments.length > 0
        ) {
          return;
        }
        const ancestors = context.sourceCode.getAncestors(node);
        const inIf = ancestors.some((a) => a.type === "IfStatement");
        const inLogical = ancestors.some(
          (a) =>
            a.type === "LogicalExpression" &&
            (a.operator === "||" || a.operator === "&&")
        );
        const inElseIf = ancestors.some(
          (a) => a.type === "IfStatement" && a.alternate?.type === "IfStatement"
        );
        if (inIf && !inLogical && !inElseIf) {
          report(
            context,
            node,
            "Direct auth role checks are not allowed in route handlers. Use ensureIsAdmin(), ensureIsManager(), ensureIsUser(), or ensureIsDustSuperUser() middleware from @front-api/middlewares/ensure_role instead."
          );
        }
      },
    };
  },
};

const nextjsPageComponentNaming = {
  create(context) {
    if (!/\/pages\//.test(context.filename.replaceAll("\\", "/"))) {
      return {};
    }
    return {
      ExportDefaultDeclaration(node) {
        const d = node.declaration;
        if (
          d.type === "FunctionDeclaration" &&
          d.id &&
          !d.id.name.endsWith("NextJS")
        ) {
          report(
            context,
            node,
            "NextJS page default export should be named with 'NextJS' suffix."
          );
        }
      },
    };
  },
};

// Packages on the classic JSX runtime, where `React` must stay imported.
// Matched here rather than in an override: oxlint ignores `excludeFiles`
// of an extended config, which is how react-doctor loads ours.
const CLASSIC_JSX_RUNTIME_PATHS = /(^|\/)(sparkle|cli\/dust-cli)\//;

const noUnusedReactImport = {
  create(context) {
    if (
      CLASSIC_JSX_RUNTIME_PATHS.test(context.filename.replaceAll("\\", "/"))
    ) {
      return {};
    }
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "react" || node.importKind === "type") {
          return;
        }
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" || spec.local.name !== "React") {
            continue;
          }
          const [variable] = context.sourceCode.getDeclaredVariables(spec);
          // oxlint adds a synthetic reference at the import for implicit JSX uses.
          const uses = variable?.references.filter(
            (r) => r.identifier.range[0] !== spec.local.range[0]
          );
          if (uses?.length === 0) {
            report(
              context,
              spec,
              "Unused `React` import: the automatic JSX runtime does not need it."
            );
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "dust" },
  rules: {
    noRawSql,
    noUnusedReactImport,
    noUnverifiedWorkspaceBypass,
    noExpensiveConversationFetch,
    enforceClientTypesInPublicApi,
    noCssImportant,
    noBulkLodash,
    noDirectSparkleNotification,
    noClientDeepImports,
    noLocaleLessDateTimeFormat,
    noLocaleLessToLocaleString,
    noSparkleToLocaleFormat,
    noBareLocaleCompare,
    noHardcodedEnUsLocale,
    noClientImportsInServer,
    noNextImports,
    noSparkleClassInFront,
    noStringConcatInJsx,
    noRawErrorMessageInUi,
    tooLongIndexName,
    noSequelizeDataTypesImport,
    noInlineSuccessResponseBody,
    noDirectRoleCheck,
    nextjsPageComponentNaming,
  },
};
