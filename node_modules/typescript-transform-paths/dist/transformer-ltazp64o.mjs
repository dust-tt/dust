import { createRequire } from "node:module";
import * as path$1 from "node:path";
import path from "node:path";
import { Minimatch } from "minimatch";
import ts, { Debug, ImportsNotUsedAsValues, isInJSFile, removeFileExtension, removeSuffix } from "typescript";
import url from "node:url";
import fs from "node:fs";
import * as os from "node:os";

//#region rolldown:runtime
var __require = /* @__PURE__ */ createRequire(import.meta.url);

//#endregion
//#region src/types.ts
const RunMode = {
	TsNode: "ts-node",
	Manual: "manual",
	Program: "program"
};
const TsNodeState = {
	Full: 0,
	Stripped: 1
};

//#endregion
//#region src/utils/ts-helpers.ts
/** Determine output file path for source file */
function getOutputDirForSourceFile(context, sourceFile) {
	const { tsInstance, emitHost, outputFileNamesCache, compilerOptions, tsInstance: { getOwnEmitOutputFilePath, getOutputExtension } } = context;
	if (outputFileNamesCache.has(sourceFile)) return outputFileNamesCache.get(sourceFile);
	const outputPath = sourceFile.path && sourceFile.resolvedPath && sourceFile.path !== sourceFile.resolvedPath ? sourceFile.resolvedPath : getOwnEmitOutputFilePath(sourceFile.fileName, emitHost, getOutputExtension(sourceFile.fileName, compilerOptions));
	if (!outputPath) throw new Error(`Could not resolve output path for ${sourceFile.fileName}. Please report a GH issue at: https://github.com/LeDDGroup/typescript-transform-paths/issues`);
	const res = path.dirname(outputPath);
	outputFileNamesCache.set(sourceFile, res);
	return tsInstance.normalizePath(res);
}
/** Determine if moduleName matches config in paths */
function isModulePathsMatch(context, moduleName) {
	const { pathsPatterns, tsInstance: { matchPatternOrExact } } = context;
	return !!(pathsPatterns && matchPatternOrExact(pathsPatterns, moduleName));
}
/** Create barebones EmitHost (for no-Program transform) */
function createSyntheticEmitHost(compilerOptions, tsInstance, getCanonicalFileName, fileNames) {
	return {
		getCompilerOptions: () => compilerOptions,
		getCurrentDirectory: tsInstance.sys.getCurrentDirectory,
		getCommonSourceDirectory: () => tsInstance.getCommonSourceDirectoryOfConfig({
			options: compilerOptions,
			fileNames
		}, !tsInstance.sys.useCaseSensitiveFileNames),
		getCanonicalFileName
	};
}
/** Get ts-node register info */
function getTsNodeRegistrationProperties(tsInstance) {
	let tsNodeSymbol;
	try {
		tsNodeSymbol = __require("ts-node")?.["REGISTER_INSTANCE"];
	} catch {
		return;
	}
	if (!global.process[tsNodeSymbol]) return;
	const { config, options } = global.process[tsNodeSymbol];
	const { configFilePath } = config.options;
	const pcl = configFilePath ? tsInstance.getParsedCommandLineOfConfigFile(configFilePath, {}, tsInstance.sys) : void 0;
	const fileNames = pcl?.fileNames || config.fileNames;
	return {
		compilerOptions: Object.assign({}, config.options, options.compilerOptions, { outDir: pcl?.options.outDir }),
		fileNames,
		tsNodeOptions: options
	};
}

//#endregion
//#region src/utils/general-utils.ts
const isURL = (s) => !!s && (!!url.parse(s).host || !!url.parse(s).hostname);
const isBaseDir = (baseDir, testDir) => {
	const relative = path.relative(baseDir, testDir);
	return relative ? !relative.startsWith("..") && !path.isAbsolute(relative) : true;
};
const maybeAddRelativeLocalPrefix = (p) => p[0] === "." ? p : `./${p}`;

//#endregion
//#region src/utils/elide-import-export.ts
/**
* UPDATE:
*
* TODO - In next major version, we can remove this file entirely due to TS PR 57223
* https://github.com/microsoft/TypeScript/pull/57223
*
* This file and its contents are due to an issue in TypeScript (affecting _at least_ up to 4.1) which causes type
* elision to break during emit for nodes which have been transformed. Specifically, if the 'original' property is set,
* elision functionality no longer works.
*
* This results in module specifiers for types being output in import/export declarations in the compiled _JS files_
*
* The logic herein compensates for that issue by recreating type elision separately so that the transformer can update
* the clause with the properly elided information
*
* Issues:
*
* - See https://github.com/LeDDGroup/typescript-transform-paths/issues/184
* - See https://github.com/microsoft/TypeScript/issues/40603
* - See https://github.com/microsoft/TypeScript/issues/31446
*
* @example
*   // a.ts
*   export type A = string;
*   export const B = 2;
*
*   // b.ts
*   import { A, B } from "./b";
*   export { A } from "./b";
*
*   // Expected output for b.js
*   import { B } from "./b";
*
*   // Actual output for b.js
*   import { A, B } from "./b";
*   export { A } from "./b";
*/
function elideImportOrExportDeclaration(context, node, newModuleSpecifier, resolver) {
	const { tsInstance, factory } = context;
	const { compilerOptions } = context;
	const { visitNode, isNamedImportBindings, isImportSpecifier, SyntaxKind, visitNodes, isNamedExportBindings, isIdentifier, isExportSpecifier } = tsInstance;
	const isNamespaceExport = tsInstance.isNamespaceExport ?? ((node$1) => node$1.kind === SyntaxKind.NamespaceExport);
	if (tsInstance.isImportDeclaration(node)) {
		if (!node.importClause) return node.importClause;
		if (node.importClause.isTypeOnly) return void 0;
		const importClause = visitNode(node.importClause, visitImportClause);
		if (importClause || compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Preserve || compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Error) return factory.updateImportDeclaration(node, void 0, importClause, newModuleSpecifier, node.attributes || node.assertClause);
		else return void 0;
	} else {
		if (node.isTypeOnly) return void 0;
		if (!node.exportClause || node.exportClause.kind === SyntaxKind.NamespaceExport) return node;
		const allowEmpty = !!compilerOptions["verbatimModuleSyntax"] || !!node.moduleSpecifier && (compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Preserve || compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Error);
		const exportClause = visitNode(node.exportClause, ((bindings) => visitNamedExportBindings(bindings, allowEmpty)), isNamedExportBindings);
		return exportClause ? factory.updateExportDeclaration(node, void 0, node.isTypeOnly, exportClause, newModuleSpecifier, node.attributes || node.assertClause) : void 0;
	}
	/**
	* Visits an import clause, eliding it if it is not referenced.
	*
	* @param node The import clause node.
	*/
	function visitImportClause(node$1) {
		const name = shouldEmitAliasDeclaration(node$1) ? node$1.name : void 0;
		const namedBindings = visitNode(node$1.namedBindings, visitNamedImportBindings, isNamedImportBindings);
		return name || namedBindings ? factory.updateImportClause(node$1, false, name, namedBindings) : void 0;
	}
	/**
	* Visits named import bindings, eliding it if it is not referenced.
	*
	* @param node The named import bindings node.
	*/
	function visitNamedImportBindings(node$1) {
		if (node$1.kind === SyntaxKind.NamespaceImport) return shouldEmitAliasDeclaration(node$1) ? node$1 : void 0;
		else {
			const allowEmpty = compilerOptions["verbatimModuleSyntax"] || compilerOptions.preserveValueImports && (compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Preserve || compilerOptions.importsNotUsedAsValues === ImportsNotUsedAsValues.Error);
			const elements = visitNodes(node$1.elements, visitImportSpecifier, isImportSpecifier);
			return allowEmpty || tsInstance.some(elements) ? factory.updateNamedImports(node$1, elements) : void 0;
		}
	}
	/**
	* Visits an import specifier, eliding it if it is not referenced.
	*
	* @param node The import specifier node.
	*/
	function visitImportSpecifier(node$1) {
		return !node$1.isTypeOnly && shouldEmitAliasDeclaration(node$1) ? node$1 : void 0;
	}
	/** Visits named exports, eliding it if it does not contain an export specifier that resolves to a value. */
	function visitNamedExports(node$1, allowEmpty) {
		const elements = visitNodes(node$1.elements, visitExportSpecifier, isExportSpecifier);
		return allowEmpty || tsInstance.some(elements) ? factory.updateNamedExports(node$1, elements) : void 0;
	}
	function visitNamedExportBindings(node$1, allowEmpty) {
		return isNamespaceExport(node$1) ? visitNamespaceExports(node$1) : visitNamedExports(node$1, allowEmpty);
	}
	function visitNamespaceExports(node$1) {
		return factory.updateNamespaceExport(node$1, Debug.checkDefined(visitNode(node$1.name, (n) => n, isIdentifier)));
	}
	/**
	* Visits an export specifier, eliding it if it does not resolve to a value.
	*
	* @param node The export specifier node.
	*/
	function visitExportSpecifier(node$1) {
		return !node$1.isTypeOnly && (compilerOptions["verbatimModuleSyntax"] || resolver.isValueAliasDeclaration(node$1)) ? node$1 : void 0;
	}
	function shouldEmitAliasDeclaration(node$1) {
		return !!compilerOptions["verbatimModuleSyntax"] || isInJSFile(node$1) || (compilerOptions.preserveValueImports ? resolver.isValueAliasDeclaration(node$1) : resolver.isReferencedAliasDeclaration(node$1));
	}
}

//#endregion
//#region src/utils/get-relative-path.ts
let isCaseSensitiveFilesystem;
function tryRmFile(fileName) {
	try {
		if (fs.existsSync(fileName)) fs.rmSync(fileName, { force: true });
	} catch {}
}
function getIsFsCaseSensitive() {
	if (isCaseSensitiveFilesystem != void 0) return isCaseSensitiveFilesystem;
	for (let i = 0; i < 1e3; i++) {
		const tmpFileName = path.join(os.tmpdir(), `tstp~${i}.tmp`);
		tryRmFile(tmpFileName);
		try {
			fs.writeFileSync(tmpFileName, "");
			isCaseSensitiveFilesystem = !fs.existsSync(tmpFileName.replace("tstp", "TSTP"));
			return isCaseSensitiveFilesystem;
		} catch {} finally {
			tryRmFile(tmpFileName);
		}
	}
	console.warn(`Could not determine filesystem's case sensitivity. Please file a bug report with your system's details`);
	isCaseSensitiveFilesystem = false;
	return isCaseSensitiveFilesystem;
}
/** @private The Export is only for unit tests */
function getMatchPortion(from, to) {
	const lowerFrom = from.toLocaleLowerCase();
	const lowerTo = to.toLocaleLowerCase();
	const maxLen = Math.max(lowerFrom.length, lowerTo.length);
	let i = 0;
	while (i < maxLen) {
		if (lowerFrom[i] !== lowerTo[i]) break;
		i++;
	}
	return to.slice(0, i);
}
function getRelativePath(from, to) {
	try {
		from = fs.realpathSync.native(from);
		to = fs.realpathSync.native(to);
	} catch {
		if (!getIsFsCaseSensitive()) {
			const matchPortion = getMatchPortion(from, to);
			from = matchPortion + from.slice(matchPortion.length);
			to = matchPortion + to.slice(matchPortion.length);
		}
	}
	return path.relative(from, to);
}

//#endregion
//#region src/utils/resolve-module-name.ts
const IndexType = {
	NonIndex: 0,
	Explicit: 1,
	Implicit: 2,
	ImplicitPackage: 3
};
function getPathDetail(moduleName, resolvedModule) {
	const resolvedFileName = resolvedModule.originalPath ?? resolvedModule.resolvedFileName;
	const implicitPackageIndex = resolvedModule.packageId?.subModuleName;
	const resolvedDir = implicitPackageIndex ? removeSuffix(resolvedFileName, `/${implicitPackageIndex}`) : path$1.dirname(resolvedFileName);
	const resolvedBaseName = implicitPackageIndex ? void 0 : path$1.basename(resolvedFileName);
	const resolvedBaseNameNoExtension = resolvedBaseName && removeFileExtension(resolvedBaseName);
	const resolvedExtName = resolvedBaseName && path$1.extname(resolvedFileName);
	let baseName = implicitPackageIndex ? void 0 : path$1.basename(moduleName);
	let baseNameNoExtension = baseName && removeFileExtension(baseName);
	let extName = baseName && path$1.extname(moduleName);
	if (resolvedBaseNameNoExtension && baseName && resolvedBaseNameNoExtension === baseName) {
		baseNameNoExtension = baseName;
		extName = void 0;
	}
	const indexType = implicitPackageIndex ? IndexType.ImplicitPackage : baseNameNoExtension === "index" && resolvedBaseNameNoExtension === "index" ? IndexType.Explicit : baseNameNoExtension !== "index" && resolvedBaseNameNoExtension === "index" ? IndexType.Implicit : IndexType.NonIndex;
	if (indexType === IndexType.Implicit) {
		baseName = void 0;
		baseNameNoExtension = void 0;
		extName = void 0;
	}
	return {
		baseName,
		baseNameNoExtension,
		extName,
		resolvedBaseName,
		resolvedBaseNameNoExtension,
		resolvedExtName,
		resolvedDir,
		indexType,
		implicitPackageIndex,
		resolvedFileName
	};
}
function getResolvedSourceFile(context, fileName) {
	let res;
	const { program, tsInstance } = context;
	if (program) {
		res = program.getSourceFile(fileName);
		if (res) return res;
		res = program.getSourceFiles().find((s) => removeFileExtension(s.fileName) === removeFileExtension(fileName));
		if (res) return res;
	}
	return tsInstance.createSourceFile(fileName, ``, tsInstance.ScriptTarget.ESNext, false);
}
/** Resolve a module name */
function resolveModuleName(context, moduleName) {
	const { tsInstance, compilerOptions, sourceFile, config, rootDirs } = context;
	const { resolvedModule, failedLookupLocations } = tsInstance.resolveModuleName(moduleName, sourceFile.fileName, compilerOptions, tsInstance.sys);
	if (!resolvedModule) {
		const maybeURL = failedLookupLocations[0];
		if (!isURL(maybeURL)) return void 0;
		return {
			isURL: true,
			resolvedPath: void 0,
			outputPath: maybeURL
		};
	}
	const resolvedSourceFile = getResolvedSourceFile(context, resolvedModule.resolvedFileName);
	const { indexType, resolvedBaseNameNoExtension, resolvedFileName, implicitPackageIndex, extName, resolvedDir } = getPathDetail(moduleName, resolvedModule);
	let outputBaseName = resolvedBaseNameNoExtension ?? "";
	if (indexType === IndexType.Implicit) outputBaseName = outputBaseName.replace(/(\/index$)|(^index$)/, "");
	if (outputBaseName && extName) outputBaseName = `${outputBaseName}${extName}`;
	let srcFileOutputDir = getOutputDirForSourceFile(context, sourceFile);
	let moduleFileOutputDir = implicitPackageIndex ? resolvedDir : getOutputDirForSourceFile(context, resolvedSourceFile);
	if (config.useRootDirs && rootDirs) {
		let fileRootDir = "";
		let moduleRootDir = "";
		for (const rootDir of rootDirs) {
			if (isBaseDir(rootDir, moduleFileOutputDir) && rootDir.length > moduleRootDir.length) moduleRootDir = rootDir;
			if (isBaseDir(rootDir, srcFileOutputDir) && rootDir.length > fileRootDir.length) fileRootDir = rootDir;
		}
		if (fileRootDir && moduleRootDir) {
			srcFileOutputDir = getRelativePath(fileRootDir, srcFileOutputDir);
			moduleFileOutputDir = getRelativePath(moduleRootDir, moduleFileOutputDir);
		}
	}
	const outputDir = getRelativePath(srcFileOutputDir, moduleFileOutputDir);
	return {
		isURL: false,
		outputPath: maybeAddRelativeLocalPrefix(tsInstance.normalizePath(path$1.join(outputDir, outputBaseName))),
		resolvedPath: resolvedFileName
	};
}

//#endregion
//#region src/utils/resolve-path-update-node.ts
/** Gets proper path and calls updaterFn to get the new node if it should be updated */
function resolvePathAndUpdateNode(context, node, moduleName, updaterFn) {
	const { sourceFile, tsInstance, factory } = context;
	const { normalizePath } = tsInstance;
	const tags = getStatementTags();
	if (tags.shouldSkip) return node;
	if (tags.overridePath) {
		const transformedPath = isURL(tags.overridePath) ? tags.overridePath : maybeAddRelativeLocalPrefix(normalizePath(tags.overridePath));
		return updaterFn(factory.createStringLiteral(transformedPath));
	}
	if (!isModulePathsMatch(context, moduleName)) return node;
	const res = resolveModuleName(context, moduleName);
	if (!res) return node;
	const { outputPath, resolvedPath } = res;
	if (context.excludeMatchers) {
		for (const matcher of context.excludeMatchers) if (matcher.match(outputPath) || resolvedPath && matcher.match(resolvedPath)) return node;
	}
	return updaterFn(factory.createStringLiteral(outputPath));
	function getStatementTags() {
		let targetNode = tsInstance.isStatement(node) ? node : tsInstance.findAncestor(node, tsInstance.isStatement) ?? node;
		targetNode = tsInstance.getOriginalNode(targetNode);
		let jsDocTags;
		try {
			jsDocTags = tsInstance.getJSDocTags(targetNode);
		} catch {}
		const commentTags = /* @__PURE__ */ new Map();
		if (targetNode.pos >= 0) try {
			const trivia = targetNode.getFullText(sourceFile).slice(0, targetNode.getLeadingTriviaWidth(sourceFile));
			const regex = /^\s*\/{2,3}\s*@(transform-path|no-transform-path)(?:[^\S\n\r](.+?))?$/gim;
			for (let match = regex.exec(trivia); match; match = regex.exec(trivia)) if (match[1]) commentTags.set(match[1], match[2]);
		} catch {}
		const overridePath = findTag("transform-path");
		const shouldSkip = findTag("no-transform-path");
		return {
			overridePath: typeof overridePath === "string" ? overridePath : void 0,
			shouldSkip: !!shouldSkip
		};
		function findTag(expected) {
			if (commentTags.has(expected)) return commentTags.get(expected) || true;
			if (!jsDocTags?.length) return void 0;
			for (const tag of jsDocTags) {
				const tagName = tag.tagName.text.toLowerCase();
				if (tagName === expected) return typeof tag.comment === "string" ? tag.comment : true;
				if (typeof tag.comment !== "string" || tag.comment[0] !== "-") continue;
				const dashPos = expected.indexOf("-");
				if (dashPos < 0) return void 0;
				if (tagName === expected.slice(0, dashPos)) {
					const comment = tag.comment;
					const choppedCommentTagName = comment.slice(0, expected.length - dashPos);
					return choppedCommentTagName === expected.slice(dashPos) ? comment.slice(choppedCommentTagName.length + 1).trim() || true : void 0;
				}
			}
		}
	}
}

//#endregion
//#region src/visitor.ts
const isAsyncImport = ({ tsInstance }, node) => tsInstance.isCallExpression(node) && node.expression.kind === tsInstance.SyntaxKind.ImportKeyword && !!node.arguments[0] && tsInstance.isStringLiteral(node.arguments[0]) && node.arguments.length === 1;
const isRequire = ({ tsInstance }, node) => tsInstance.isCallExpression(node) && tsInstance.isIdentifier(node.expression) && node.expression.text === "require" && !!node.arguments[0] && tsInstance.isStringLiteral(node.arguments[0]) && node.arguments.length === 1;
/** Visit and replace nodes with module specifiers */
function nodeVisitor(node) {
	const { factory, tsInstance, transformationContext } = this;
	/**
	* Update require / import functions
	*
	* @example
	*   require("module");
	*   import("module");
	*/
	if (isRequire(this, node) || isAsyncImport(this, node)) return resolvePathAndUpdateNode(this, node, node.arguments[0].text, (p) => {
		const res = factory.updateCallExpression(node, node.expression, node.typeArguments, [p]);
		const textNode = node.arguments[0];
		if (!textNode) throw new Error("Expected textNode");
		const commentRanges = tsInstance.getLeadingCommentRanges(textNode.getFullText(), 0) ?? [];
		for (const range of commentRanges) {
			const { kind, pos, end, hasTrailingNewLine } = range;
			const caption = textNode.getFullText().substring(pos, end).replace(kind === tsInstance.SyntaxKind.MultiLineCommentTrivia ? /^\/\*(.+)\*\/.*/s : /^\/\/(.+)/s, "$1");
			tsInstance.addSyntheticLeadingComment(p, kind, caption, hasTrailingNewLine);
		}
		return res;
	});
	/**
	* Update ExternalModuleReference
	*
	* @example
	*   import foo = require("foo");
	*/
	if (tsInstance.isExternalModuleReference(node) && tsInstance.isStringLiteral(node.expression)) return resolvePathAndUpdateNode(this, node, node.expression.text, (p) => factory.updateExternalModuleReference(node, p));
	/**
	* Update ImportTypeNode
	*
	* @example
	*   typeof import("./bar");
	*   import("package").MyType;
	*/
	if (tsInstance.isImportTypeNode(node)) {
		const argument = node.argument;
		if (!tsInstance.isStringLiteral(argument.literal)) return node;
		const { text } = argument.literal;
		if (!text) return node;
		const res = resolvePathAndUpdateNode(this, node, text, (p) => factory.updateImportTypeNode(node, factory.updateLiteralTypeNode(argument, p), node.assertions, node.qualifier, node.typeArguments, node.isTypeOf));
		return tsInstance.visitEachChild(res, this.getVisitor(), transformationContext);
	}
	/**
	* Update ImportDeclaration
	*
	* @example
	*   import ... 'module';
	*/
	if (tsInstance.isImportDeclaration(node) && node.moduleSpecifier && tsInstance.isStringLiteral(node.moduleSpecifier)) return resolvePathAndUpdateNode(this, node, node.moduleSpecifier.text, (p) => {
		if (!this.isDeclarationFile && node.importClause?.namedBindings) {
			const resolver = transformationContext.getEmitResolver();
			if (resolver) return elideImportOrExportDeclaration(this, node, p, resolver);
		}
		return factory.updateImportDeclaration(node, node.modifiers, node.importClause, p, node.assertClause);
	});
	/**
	* Update ExportDeclaration
	*
	* @example
	*   export ... 'module';
	*/
	if (tsInstance.isExportDeclaration(node) && node.moduleSpecifier && tsInstance.isStringLiteral(node.moduleSpecifier)) return resolvePathAndUpdateNode(this, node, node.moduleSpecifier.text, (p) => {
		if (!this.isDeclarationFile && node.exportClause && tsInstance.isNamedExports(node.exportClause)) {
			const resolver = transformationContext.getEmitResolver();
			if (resolver) return elideImportOrExportDeclaration(this, node, p, resolver);
		}
		return factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, p, node.assertClause);
	});
	/** Update module augmentation */
	if (tsInstance.isModuleDeclaration(node) && tsInstance.isStringLiteral(node.name)) return resolvePathAndUpdateNode(this, node, node.name.text, (p) => factory.updateModuleDeclaration(node, node.modifiers, p, node.body));
	return tsInstance.visitEachChild(node, this.getVisitor(), transformationContext);
}

//#endregion
//#region src/transformer.ts
function getTsProperties(args) {
	let fileNames;
	let compilerOptions;
	let runMode;
	let tsNodeState;
	const { 0: program, 2: extras, 3: manualTransformOptions } = args;
	const tsInstance = extras?.ts ?? ts;
	if (program) compilerOptions = program.getCompilerOptions();
	const tsNodeProps = getTsNodeRegistrationProperties(tsInstance);
	const isTsNode = tsNodeProps && (!program || compilerOptions.configFilePath === tsNodeProps.compilerOptions.configFilePath);
	if (program && !isTsNode) {
		runMode = RunMode.Program;
		compilerOptions = compilerOptions;
	} else if (manualTransformOptions) {
		runMode = RunMode.Manual;
		fileNames = manualTransformOptions.fileNames;
		compilerOptions = manualTransformOptions.compilerOptions;
	} else if (isTsNode) {
		fileNames = tsNodeProps.fileNames;
		runMode = RunMode.TsNode;
		tsNodeState = !program || fileNames.length > 1 && program?.getRootFileNames().length === 1 || !compilerOptions.paths && tsNodeProps.compilerOptions.paths ? TsNodeState.Stripped : TsNodeState.Full;
		compilerOptions = tsNodeState === TsNodeState.Full ? compilerOptions : {
			...program?.getCompilerOptions(),
			...tsNodeProps.compilerOptions
		};
	} else throw new Error("Cannot transform without a Program, ts-node instance, or manual parameters supplied. Make sure you're using ts-patch or ts-node with transpileOnly.");
	return {
		tsInstance,
		compilerOptions,
		fileNames,
		runMode,
		tsNodeState
	};
}
function transformer(program, pluginConfig, transformerExtras, manualTransformOptions) {
	return (transformationContext) => {
		const { tsInstance, compilerOptions, fileNames, runMode, tsNodeState } = getTsProperties([
			program,
			pluginConfig,
			transformerExtras,
			manualTransformOptions
		]);
		const rootDirs = compilerOptions.rootDirs?.filter(path.isAbsolute);
		const config = pluginConfig ?? {};
		const getCanonicalFileName = tsInstance.createGetCanonicalFileName(tsInstance.sys.useCaseSensitiveFileNames);
		let emitHost = transformationContext.getEmitHost();
		if (!emitHost || tsNodeState === TsNodeState.Stripped) {
			if (!fileNames) throw new Error(`No EmitHost found and could not determine files to be processed. Please file an issue with a reproduction!`);
			emitHost = createSyntheticEmitHost(compilerOptions, tsInstance, getCanonicalFileName, fileNames);
		}
		const { configFile, paths } = compilerOptions;
		const { tryParsePatterns } = tsInstance;
		const [tsVersionMajor, tsVersionMinor] = tsInstance.versionMajorMinor.split(".").map((v) => +v);
		if (tsVersionMajor === void 0 || tsVersionMinor === void 0) throw new Error("Expected version to be parsed");
		const tsTransformPathsContext = {
			compilerOptions,
			config,
			elisionMap: /* @__PURE__ */ new Map(),
			tsFactory: transformationContext.factory,
			program,
			rootDirs,
			transformationContext,
			tsInstance,
			tsVersionMajor,
			tsVersionMinor,
			emitHost,
			runMode,
			tsNodeState,
			excludeMatchers: config.exclude?.map((globPattern) => new Minimatch(globPattern, { matchBase: true })),
			outputFileNamesCache: /* @__PURE__ */ new Map(),
			pathsPatterns: paths && (tryParsePatterns ? configFile?.configFileSpecs?.pathPatterns || tryParsePatterns(paths) : tsInstance.getOwnKeys(paths))
		};
		return (sourceFile) => {
			const visitorContext = {
				...tsTransformPathsContext,
				sourceFile,
				isDeclarationFile: sourceFile.isDeclarationFile,
				originalSourceFile: ts.getParseTreeNode(sourceFile, ts.isSourceFile) || sourceFile,
				getVisitor() {
					return nodeVisitor.bind(this);
				},
				factory: tsTransformPathsContext.tsFactory ?? tsTransformPathsContext.tsInstance
			};
			return tsInstance.visitEachChild(sourceFile, visitorContext.getVisitor(), transformationContext);
		};
	};
}

//#endregion
export { transformer as t };