'use strict';

var commander = require('commander');
var path = require('path');
var glob = require('glob');
var fs = require('fs');
var core = require('@svgr/core');
var chalk = require('chalk');
var svgo = require('@svgr/plugin-svgo');
var jsx = require('@svgr/plugin-jsx');
var prettier = require('@svgr/plugin-prettier');
var camelCase = require('camelcase');
var dashify = require('dashify');
var snakeCase = require('snake-case');
var prettier$1 = require('prettier');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);

var __defProp$2 = Object.defineProperty;
var __defProps$1 = Object.defineProperties;
var __getOwnPropDescs$1 = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols$2 = Object.getOwnPropertySymbols;
var __hasOwnProp$2 = Object.prototype.hasOwnProperty;
var __propIsEnum$2 = Object.prototype.propertyIsEnumerable;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues$2 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp$2.call(b, prop))
      __defNormalProp$2(a, prop, b[prop]);
  if (__getOwnPropSymbols$2)
    for (var prop of __getOwnPropSymbols$2(b)) {
      if (__propIsEnum$2.call(b, prop))
        __defNormalProp$2(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps$1 = (a, b) => __defProps$1(a, __getOwnPropDescs$1(b));
function transformFilename(filename, filenameCase) {
  switch (filenameCase) {
    case "kebab":
      return dashify(filename.replace(/_/g, "-"), { condense: true });
    case "camel":
      return camelCase(filename);
    case "pascal":
      return camelCase(filename, { pascalCase: true });
    case "snake":
      return snakeCase.snakeCase(filename);
    default:
      throw new Error(`Unknown --filename-case ${filenameCase}`);
  }
}
const convert = (code, config, state) => {
  return core.transform.sync(code, config, __spreadProps$1(__spreadValues$2({}, state), {
    caller: {
      name: "@svgr/cli",
      defaultPlugins: [svgo, jsx, prettier]
    }
  }));
};
const convertFile = async (filePath, config = {}) => {
  const code = await fs.promises.readFile(filePath, "utf-8");
  return convert(code, config, { filePath });
};
const exitError = (error) => {
  console.error(chalk.red(error));
  process.exit(1);
};
const politeWrite = (data, silent) => {
  if (!silent) {
    process.stdout.write(data);
  }
};
const formatExportName = (name) => {
  if (/[-]/g.test(name) && /^\d/.test(name)) {
    return `Svg${camelCase(name, { pascalCase: true })}`;
  }
  if (/^\d/.test(name)) {
    return `Svg${name}`;
  }
  return camelCase(name, { pascalCase: true });
};

const readStdin = async () => {
  return new Promise((resolve) => {
    let code = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("readable", () => {
      const chunk = process.stdin.read();
      if (chunk !== null)
        code += chunk;
    });
    process.stdin.on("end", () => {
      resolve(code);
    });
  });
};
const fileCommand = async (opts, program, filenames) => {
  if (opts.stdin || filenames.length === 0 && !process.stdin.isTTY) {
    const input = await readStdin();
    const output2 = convert(input, opts, { filePath: opts.stdinFilepath });
    process.stdout.write(`${output2}
`);
    return;
  }
  if (filenames.length === 0) {
    process.stdout.write(`${program.helpInformation()}
`);
    return;
  }
  if (filenames.length > 1) {
    exitError("Please specify only one filename or use `--out-dir` option.");
  }
  const [filename] = filenames;
  const stats = await fs.promises.stat(filename);
  if (stats.isDirectory()) {
    exitError("Directory are not supported without `--out-dir` option instead.");
  }
  const output = await convertFile(filename, opts);
  process.stdout.write(`${output}
`);
};

var __defProp$1 = Object.defineProperty;
var __getOwnPropSymbols$1 = Object.getOwnPropertySymbols;
var __hasOwnProp$1 = Object.prototype.hasOwnProperty;
var __propIsEnum$1 = Object.prototype.propertyIsEnumerable;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues$1 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp$1.call(b, prop))
      __defNormalProp$1(a, prop, b[prop]);
  if (__getOwnPropSymbols$1)
    for (var prop of __getOwnPropSymbols$1(b)) {
      if (__propIsEnum$1.call(b, prop))
        __defNormalProp$1(a, prop, b[prop]);
    }
  return a;
};
const exists = async (filepath) => {
  try {
    await fs.promises.access(filepath);
    return true;
  } catch (error) {
    return false;
  }
};
const rename = (relative, ext, filenameCase) => {
  const relativePath = path__namespace.parse(relative);
  relativePath.ext = `.${ext}`;
  relativePath.base = "";
  relativePath.name = transformFilename(relativePath.name, filenameCase);
  return path__namespace.format(relativePath);
};
const isCompilable = (filename) => {
  const ext = path__namespace.extname(filename);
  return ext === ".svg" || ext == ".SVG";
};
const defaultIndexTemplate = (paths) => {
  const exportEntries = paths.map(({ path: filePath }) => {
    const basename = path__namespace.basename(filePath, path__namespace.extname(filePath));
    const exportName = formatExportName(basename);
    return `export { default as ${exportName} } from './${basename}'`;
  });
  return exportEntries.join("\n");
};
const resolveExtension = (config, ext, jsx) => ext || (config.typescript ? jsx ? "tsx" : "ts" : "js");
const dirCommand = async (opts, _, filenames) => {
  const {
    ext: extOpt,
    filenameCase = "pascal",
    ignoreExisting,
    silent,
    configFile,
    outDir
  } = opts;
  const ext = resolveExtension(opts, extOpt, true);
  const write = async (src, dest) => {
    if (!isCompilable(src)) {
      return { transformed: false, dest: null };
    }
    dest = rename(dest, ext, filenameCase);
    const code = await convertFile(src, opts);
    const cwdRelative = path__namespace.relative(process.cwd(), dest);
    const logOutput = `${src} -> ${cwdRelative}
`;
    if (ignoreExisting && await exists(dest)) {
      politeWrite(chalk.grey(logOutput), silent);
      return { transformed: false, dest };
    }
    await fs.promises.mkdir(path__namespace.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, code);
    politeWrite(chalk.white(logOutput), silent);
    return { transformed: true, dest };
  };
  const generateIndex = async (dest, files, opts2) => {
    const ext2 = resolveExtension(opts2, extOpt, false);
    const filepath = path__namespace.join(dest, `index.${ext2}`);
    const indexTemplate = opts2.indexTemplate || defaultIndexTemplate;
    const fileContent = indexTemplate(files);
    const prettyContent = await (async () => {
      if (!opts2.prettier)
        return fileContent;
      const prettierRcConfig = opts2.runtimeConfig ? await prettier$1.resolveConfig(filepath, { editorconfig: true }) : {};
      return prettier$1.format(fileContent, __spreadValues$1(__spreadValues$1({
        filepath
      }, prettierRcConfig), opts2.prettierConfig));
    })();
    await fs.promises.writeFile(filepath, prettyContent);
  };
  async function handle(filename, root) {
    const stats = await fs.promises.stat(filename);
    if (stats.isDirectory()) {
      const dirname = filename;
      const files = await fs.promises.readdir(dirname);
      const results = await Promise.all(
        files.map(async (relativeFile) => {
          const absFile = path__namespace.join(dirname, relativeFile);
          return [absFile, await handle(absFile, root)];
        })
      );
      const transformed = results.filter(([, result]) => result.transformed);
      if (transformed.length) {
        const destFiles = results.filter(([, result]) => result.dest).map(([originalPath, result]) => ({
          path: result.dest,
          originalPath
        })).filter(({ path: path2 }) => path2);
        const dest2 = path__namespace.resolve(
          outDir,
          path__namespace.relative(root, dirname)
        );
        const resolvedConfig = core.loadConfig.sync(
          __spreadValues$1({ configFile }, opts),
          { filePath: dest2 }
        );
        if (resolvedConfig.index) {
          await generateIndex(dest2, destFiles, opts);
        }
      }
      return { transformed: false, dest: null };
    }
    const dest = path__namespace.resolve(outDir, path__namespace.relative(root, filename));
    return write(filename, dest).catch((err) => {
      console.error("Failed to handle file: ", filename);
      throw err;
    });
  }
  await Promise.all(
    filenames.map(async (file) => {
      const stats = await fs.promises.stat(file);
      const root = stats.isDirectory() ? file : path__namespace.dirname(file);
      await handle(file, root);
    })
  );
};

var version = "8.1.0";

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
const noUndefinedKeys = (obj) => {
  return Object.entries(obj).reduce((obj2, [key, value]) => {
    if (value !== void 0) {
      obj2[key] = value;
    }
    return obj2;
  }, {});
};
const parseObject = (arg, accumulation = {}) => {
  const [name, value] = arg.split("=");
  return __spreadProps(__spreadValues({}, accumulation), { [name]: value });
};
const parseObjectList = (arg, accumulation = {}) => {
  const args = arg.split(",").map((str) => str.trim());
  return args.reduce((acc, arg2) => parseObject(arg2, acc), accumulation);
};
const parseConfig = (name) => (arg) => {
  try {
    if (arg.endsWith("rc")) {
      const content = fs.readFileSync(arg, "utf-8");
      return JSON.parse(content);
    }
    const ext = path__namespace.extname(arg);
    if (ext === ".js" || ext === ".json" || ext === ".cjs") {
      return require(path__namespace.join(process.cwd(), arg));
    }
    return JSON.parse(arg);
  } catch (error) {
    exitError(
      `"${name}" is not valid, please specify a valid file or use a inline JSON.`
    );
  }
};
const parseExpandProps = (arg) => arg === "none" ? false : arg;
const parseTemplate = (name) => (arg) => {
  try {
    const template = require(path__namespace.join(process.cwd(), arg));
    const resolved = template.default || template;
    if (typeof resolved !== "function") {
      throw new Error(`${name} file must export a function`);
    }
    return resolved;
  } catch (error) {
    console.error(`Error when loading "${name}": ${arg}
`);
    console.error(error.stack);
    process.exit(2);
  }
};
const parseIconSize = (arg) => {
  const num = Number(arg);
  return Number.isNaN(num) ? arg : num;
};
commander.program.version(version).usage("[options] <file|directory>").option("--config-file <file>", "specify the path of the svgr config").option(
  "--no-runtime-config",
  'disable runtime config (".svgrrc", ".svgo.yml", ".prettierrc")'
).option("-d, --out-dir <dirname>", "output files into a directory").option("--ignore-existing", "ignore existing files when used with --out-dir").option("--ext <ext>", 'specify a custom file extension (default: "js")').option(
  "--filename-case <case>",
  'specify filename case ("pascal", "kebab", "camel", "snake") (default: "pascal")'
).option(
  "--icon [size]",
  'specify width and height (default to "1em" or 24dp (native))',
  parseIconSize
).option(
  "--jsx-runtime <runtime>",
  'specify JSX runtime ("automatic", "classic", "classic-preact") (default: "classic")'
).option("--typescript", "transform svg into typescript").option("--native", "add react-native support with react-native-svg").option("--memo", "add React.memo into the result component").option("--ref", "forward ref to SVG root element").option("--no-dimensions", "remove width and height from root SVG tag").option(
  "--expand-props [position]",
  'disable props expanding ("start", "end", "none") (default: "end")',
  parseExpandProps
).option(
  "--svg-props <property=value>",
  "add props to the svg element",
  parseObjectList
).option(
  "--replace-attr-values <old=new>",
  "replace an attribute value",
  parseObjectList
).option(
  "--template <file>",
  "specify a custom template to use",
  parseTemplate("--template")
).option(
  "--index-template <file>",
  "specify a custom index.js template to use",
  parseTemplate("--index-template")
).option("--no-index", "disable index file generation").option("--title-prop", "create a title element linked with props").option("--desc-prop", "create a desc element linked with props").option(
  "--prettier-config <fileOrJson>",
  "Prettier config",
  parseConfig("--prettier-config")
).option("--no-prettier", "disable Prettier").option(
  "--svgo-config <fileOrJson>",
  "SVGO config",
  parseConfig("--svgo-config")
).option("--no-svgo", "disable SVGO").option("--silent", "suppress output").option("--stdin", "force reading input from stdin").option(
  "--stdin-filepath",
  "path to the file to pretend that stdin comes from"
);
commander.program.on("--help", () => {
  console.log(`
  Examples:
    svgr --replace-attr-values "#fff=currentColor" icon.svg
`);
});
commander.program.parse(process.argv);
async function run() {
  const errors = [];
  const filenames = commander.program.args.reduce((globbed, input) => {
    let files = glob.glob.sync(input);
    if (!files.length)
      files = [input];
    return [...globbed, ...files];
  }, []);
  await Promise.all(
    filenames.map(async (filename) => {
      try {
        await fs.promises.stat(filename);
      } catch (error) {
        errors.push(`${filename} does not exist`);
      }
    })
  );
  if (errors.length) {
    console.error(errors.join(". "));
    process.exit(2);
  }
  const programOpts = noUndefinedKeys(commander.program.opts());
  if (programOpts.dimensions)
    delete programOpts.dimensions;
  if (programOpts.svgo)
    delete programOpts.svgo;
  if (programOpts.prettier)
    delete programOpts.prettier;
  const opts = await core.loadConfig(programOpts, {
    filePath: process.cwd()
  });
  const command = opts.outDir ? dirCommand : fileCommand;
  await command(opts, commander.program, filenames);
}
run().catch((error) => {
  setTimeout(() => {
    throw error;
  });
});
