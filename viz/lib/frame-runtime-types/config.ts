import ts from "typescript";

export function createValidationFiles(modules: Record<string, string[]>) {
  const files = new Map<string, string>();
  // These references resolve to data files or child Frames at render time.
  files.set(
    "node_modules/@types/dust-frame-refs/index.d.ts",
    [
      'declare module "fil_*"',
      'declare module "conversation-*"',
      'declare module "pod-*"',
      'declare module "conversation/*"',
      'declare module "pod/*"',
      'declare module "project/*"',
    ].join("\n")
  );
  files.set(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          lib: ["ESNext", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react",
          strict: true,
          noImplicitAny: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowUmdGlobalAccess: true,
          allowImportingTsExtensions: true,
          allowJs: true,
          checkJs: true,
          resolveJsonModule: true,
          noEmit: true,
          typeRoots: ["./node_modules/@types", "./viz/node_modules/@types"],
          types: ["react", "dust-frame-refs"],
          paths: modules,
        },
      },
      null,
      2
    )
  );
  const metadata = {
    typescriptVersion: ts.version,
    modules: Object.keys(modules),
  };
  files.set("runtime.json", JSON.stringify(metadata, null, 2));
  return { files, metadata };
}
