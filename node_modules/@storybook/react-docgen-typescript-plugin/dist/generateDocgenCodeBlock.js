"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocgenCodeBlock = void 0;
const tslib_1 = require("tslib");
const path_1 = tslib_1.__importDefault(require("path"));
const typescript_1 = tslib_1.__importDefault(require("typescript"));
const getIdentifier_1 = require("./getIdentifier");
/**
 * Inserts a ts-ignore comment above the supplied statement.
 *
 * It is used to work around type errors related to fields like __docgenInfo not
 * being defined on types. It also prevents compile errors related to attempting
 * to assign to nonexistent components, which can happen due to incorrect
 * detection of component names when using the parser.
 * ```
 * // @ts-ignore
 * ```
 * @param statement
 */
function insertTsIgnoreBeforeStatement(statement) {
    typescript_1.default.setSyntheticLeadingComments(statement, [
        {
            text: " @ts-ignore",
            kind: typescript_1.default.SyntaxKind.SingleLineCommentTrivia,
            pos: -1,
            end: -1,
        },
    ]);
    return statement;
}
/**
 * Set component display name.
 *
 * ```
 * SimpleComponent.displayName = "SimpleComponent";
 * ```
 */
function setDisplayName(d) {
    return insertTsIgnoreBeforeStatement(typescript_1.default.factory.createExpressionStatement(typescript_1.default.factory.createBinaryExpression(typescript_1.default.factory.createPropertyAccessExpression(typescript_1.default.factory.createIdentifier((0, getIdentifier_1.getIdentifier)(d)), typescript_1.default.factory.createIdentifier("displayName")), typescript_1.default.SyntaxKind.EqualsToken, typescript_1.default.factory.createStringLiteral(d.displayName))));
}
/**
 * Set a component prop description.
 * ```
 * SimpleComponent.__docgenInfo.props.someProp = {
 *   defaultValue: "blue",
 *   description: "Prop description.",
 *   name: "someProp",
 *   required: true,
 *   type: "'blue' | 'green'",
 * }
 * ```
 *
 * @param propName Prop name
 * @param prop Prop definition from `ComponentDoc.props`
 * @param options Generator options.
 */
function createPropDefinition(propName, prop, options) {
    /**
     * Set default prop value.
     *
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.defaultValue = null;
     * SimpleComponent.__docgenInfo.props.someProp.defaultValue = {
     *   value: "blue",
     * };
     * ```
     *
     * @param defaultValue Default prop value or null if not set.
     */
    const setDefaultValue = (defaultValue) => typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("defaultValue"), 
    // Use a more extensive check on defaultValue. Sometimes the parser
    // returns an empty object.
    defaultValue !== null &&
        defaultValue !== undefined &&
        typeof defaultValue === "object" &&
        "value" in defaultValue &&
        (typeof defaultValue.value === "string" ||
            typeof defaultValue.value === "number" ||
            typeof defaultValue.value === "boolean")
        ? typescript_1.default.factory.createObjectLiteralExpression([
            typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createIdentifier("value"), 
            // eslint-disable-next-line no-nested-ternary
            typeof defaultValue.value === "string"
                ? typescript_1.default.factory.createStringLiteral(defaultValue.value)
                : // eslint-disable-next-line no-nested-ternary
                    typeof defaultValue.value === "number"
                        ? typescript_1.default.factory.createNumericLiteral(defaultValue.value)
                        : defaultValue.value
                            ? typescript_1.default.factory.createTrue()
                            : typescript_1.default.factory.createFalse()),
        ])
        : typescript_1.default.factory.createNull());
    /** Set a property with a string value */
    const setStringLiteralField = (fieldName, fieldValue) => typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral(fieldName), typescript_1.default.factory.createStringLiteral(fieldValue));
    /**
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.description = "Prop description.";
     * ```
     * @param description Prop description.
     */
    const setDescription = (description) => setStringLiteralField("description", description);
    /**
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.name = "someProp";
     * ```
     * @param name Prop name.
     */
    const setName = (name) => setStringLiteralField("name", name);
    /**
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.required = true;
     * ```
     * @param required Whether prop is required or not.
     */
    const setRequired = (required) => typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("required"), required ? typescript_1.default.factory.createTrue() : typescript_1.default.factory.createFalse());
    /**
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.type = {
     *  name: "enum",
     *  value: [ { value: "\"blue\"" }, { value: "\"green\""} ]
     * }
     * ```
     * @param [typeValue] Prop value (for enums)
     */
    const setValue = (typeValue) => Array.isArray(typeValue) &&
        typeValue.every((value) => typeof value.value === "string")
        ? typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("value"), typescript_1.default.factory.createArrayLiteralExpression(typeValue.map((value) => typescript_1.default.factory.createObjectLiteralExpression([
            setStringLiteralField("value", value.value),
        ]))))
        : undefined;
    /**
     * ```
     * SimpleComponent.__docgenInfo.props.someProp.type = { name: "'blue' | 'green'"}
     * ```
     * @param typeName Prop type name.
     * @param [typeValue] Prop value (for enums)
     */
    const setType = (typeName, typeValue) => {
        const objectFields = [setStringLiteralField("name", typeName)];
        const valueField = setValue(typeValue);
        if (valueField) {
            objectFields.push(valueField);
        }
        return typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral(options.typePropName), typescript_1.default.factory.createObjectLiteralExpression(objectFields));
    };
    return typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral(propName), typescript_1.default.factory.createObjectLiteralExpression([
        setDefaultValue(prop.defaultValue),
        setDescription(prop.description),
        setName(prop.name),
        setRequired(prop.required),
        setType(prop.type.name, prop.type.value),
    ]));
}
/**
 * Adds a component's docgen info to the global docgen collection.
 *
 * ```
 * if (typeof STORYBOOK_REACT_CLASSES !== "undefined") {
 *   STORYBOOK_REACT_CLASSES["src/.../SimpleComponent.tsx"] = {
 *     name: "SimpleComponent",
 *     docgenInfo: SimpleComponent.__docgenInfo,
 *     path: "src/.../SimpleComponent.tsx",
 *   };
 * }
 * ```
 *
 * @param d Component doc.
 * @param docgenCollectionName Global docgen collection variable name.
 * @param relativeFilename Relative file path of the component source file.
 */
function insertDocgenIntoGlobalCollection(d, docgenCollectionName, relativeFilename) {
    return insertTsIgnoreBeforeStatement(typescript_1.default.factory.createIfStatement(typescript_1.default.factory.createBinaryExpression(typescript_1.default.factory.createTypeOfExpression(typescript_1.default.factory.createIdentifier(docgenCollectionName)), typescript_1.default.SyntaxKind.ExclamationEqualsEqualsToken, typescript_1.default.factory.createStringLiteral("undefined")), insertTsIgnoreBeforeStatement(typescript_1.default.factory.createExpressionStatement(typescript_1.default.factory.createBinaryExpression(typescript_1.default.factory.createElementAccessExpression(typescript_1.default.factory.createIdentifier(docgenCollectionName), typescript_1.default.factory.createStringLiteral(`${relativeFilename}#${d.displayName}`)), typescript_1.default.SyntaxKind.EqualsToken, typescript_1.default.factory.createObjectLiteralExpression([
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createIdentifier("docgenInfo"), typescript_1.default.factory.createPropertyAccessExpression(typescript_1.default.factory.createIdentifier(d.displayName), typescript_1.default.factory.createIdentifier("__docgenInfo"))),
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createIdentifier("name"), typescript_1.default.factory.createStringLiteral(d.displayName)),
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createIdentifier("path"), typescript_1.default.factory.createStringLiteral(`${relativeFilename}#${d.displayName}`)),
    ]))))));
}
/**
 * Sets the field `__docgenInfo` for the component specified by the component
 * doc with the docgen information.
 *
 * ```
 * SimpleComponent.__docgenInfo = {
 *   description: ...,
 *   displayName: ...,
 *   props: ...,
 * }
 * ```
 *
 * @param d Component doc.
 * @param options Generator options.
 */
function setComponentDocGen(d, options) {
    return insertTsIgnoreBeforeStatement(typescript_1.default.factory.createExpressionStatement(typescript_1.default.factory.createBinaryExpression(
    // SimpleComponent.__docgenInfo
    typescript_1.default.factory.createPropertyAccessExpression(typescript_1.default.factory.createIdentifier((0, getIdentifier_1.getIdentifier)(d)), typescript_1.default.factory.createIdentifier("__docgenInfo")), typescript_1.default.SyntaxKind.EqualsToken, typescript_1.default.factory.createObjectLiteralExpression([
        // SimpleComponent.__docgenInfo.description
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("description"), typescript_1.default.factory.createStringLiteral(d.description)),
        // SimpleComponent.__docgenInfo.displayName
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("displayName"), typescript_1.default.factory.createStringLiteral(d.displayName)),
        // SimpleComponent.__docgenInfo.props
        typescript_1.default.factory.createPropertyAssignment(typescript_1.default.factory.createStringLiteral("props"), typescript_1.default.factory.createObjectLiteralExpression(Object.entries(d.props).map(([propName, prop]) => createPropDefinition(propName, prop, options)))),
    ]))));
}
function generateDocgenCodeBlock(options) {
    const sourceFile = typescript_1.default.createSourceFile(options.filename, options.source, typescript_1.default.ScriptTarget.ESNext);
    const relativeFilename = path_1.default
        .relative("./", path_1.default.resolve("./", options.filename))
        .replace(/\\/g, "/");
    const wrapInTryStatement = (statements) => typescript_1.default.factory.createTryStatement(typescript_1.default.factory.createBlock(statements, true), typescript_1.default.factory.createCatchClause(typescript_1.default.factory.createVariableDeclaration(typescript_1.default.factory.createIdentifier("__react_docgen_typescript_loader_error")), typescript_1.default.factory.createBlock([])), undefined);
    const codeBlocks = options.componentDocs.map((d) => wrapInTryStatement([
        options.setDisplayName ? setDisplayName(d) : null,
        setComponentDocGen(d, options),
        options.docgenCollectionName === null ||
            options.docgenCollectionName === undefined
            ? null
            : insertDocgenIntoGlobalCollection(d, options.docgenCollectionName, relativeFilename),
    ].filter((s) => s !== null)));
    const printer = typescript_1.default.createPrinter({ newLine: typescript_1.default.NewLineKind.LineFeed });
    const printNode = (sourceNode) => printer.printNode(typescript_1.default.EmitHint.Unspecified, sourceNode, sourceFile);
    // Concat original source code with code from generated code blocks.
    const result = codeBlocks.reduce((acc, node) => `${acc}\n${printNode(node)}`, 
    // Use original source text rather than using printNode on the parsed form
    // to prevent issue where literals are stripped within components.
    // Ref: https://github.com/strothj/react-docgen-typescript-loader/issues/7
    options.source);
    return result;
}
exports.generateDocgenCodeBlock = generateDocgenCodeBlock;
//# sourceMappingURL=generateDocgenCodeBlock.js.map