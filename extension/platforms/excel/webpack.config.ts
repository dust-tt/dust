import type { Environment } from "@extension/config/env";
import {
  getImportMetaEnvFromVars,
  parseEnvFile,
  resolveEnvVar,
} from "@extension/config/webpack_env";
import { startSignInProxy } from "@extension/platforms/excel/sign_in_proxy";
import { execSync } from "child_process";
import CopyPlugin from "copy-webpack-plugin";
import * as esbuild from "esbuild";
import fs from "fs";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import WebpackBar from "webpackbar";
import ZipPlugin from "zip-webpack-plugin";

const rootDir = path.resolve(__dirname);

const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

// Get git commit hash
const getCommitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    console.error(e);
    return "development";
  }
};

// Office refuses to load a task pane over plain HTTP, including on localhost,
// so the dev server needs a locally-trusted certificate.
//
// Only pre-installed certificates are used here: generating them has to install
// a CA in the system keychain, which prompts for credentials — not something a
// build should do behind the developer's back. `npm run dev:excel:certs` does
// that once, deliberately.
const getHttpsServerOptions = async (): Promise<
  { key: Buffer; cert: Buffer; ca?: Buffer } | undefined
> => {
  try {
    const devCerts = await import("office-addin-dev-certs");
    if (await devCerts.verifyCertificates()) {
      return await devCerts.getHttpsServerOptions();
    }
  } catch (e) {
    console.warn("Could not read the local dev certificates.", e);
  }

  console.warn(
    "\n⚠️  No local dev certificate found: serving the task pane over HTTP.\n" +
      "   Excel will refuse to load it. Run `npm run dev:excel:certs` once, then restart.\n"
  );
  return undefined;
};

/** Request path prefixes the dev server forwards to the real Dust backend. */
const PROXIED_API_PREFIXES = ["/api", "/sse", "/mcp"];

/**
 * Resolves the environment the bundle is built against.
 *
 * In development the Dust URLs are rewritten to the add-in's own origin, and the
 * dev server proxies `PROXIED_API_PREFIXES` to wherever Dust actually runs.
 * The indirection is required rather than cosmetic: Office serves the task pane
 * over HTTPS, and WebKit — unlike Chromium — does not exempt `http://localhost`
 * from mixed-content blocking, so a direct `fetch` to a plain-HTTP local Dust
 * fails with "TypeError: Load failed". Routing through the dev server makes
 * every request same-origin HTTPS, which also removes CORS from the picture.
 *
 * The sign-in dialog goes through the same proxy, and must: an Office dialog
 * refuses any page it is navigated to over plain HTTP (error 12003) and
 * replaces itself with the host's generic "we can't load the add-in" screen.
 * `/api/workos/login` therefore has to be reached on the add-in's own HTTPS
 * origin, which the proxy forwards to the local Dust; its redirect to the
 * identity provider is already HTTPS and leaves the dialog on a declared
 * `AppDomain`.
 */
const resolveEnvVars = ({
  env,
  isDevelopment,
}: {
  env: Environment;
  isDevelopment: boolean;
}): { vars: Record<string, string>; apiProxyTarget: string | null } => {
  const fileVars = parseEnvFile(
    resolvePath(
      isDevelopment ? "../../.env.development" : "../../.env.production"
    )
  );

  const addInUrl = resolveEnvVar(fileVars, "EXCEL_EXTENSION_URL").replace(
    /\/$/,
    ""
  );
  if (!addInUrl) {
    throw new Error(
      "❌ EXCEL_EXTENSION_URL must be set in the .env file: it is the absolute URL " +
        `the add-in is served from, and the Office manifest for "${env}" needs it.`
    );
  }

  if (!addInUrl.startsWith("https://")) {
    throw new Error(
      `❌ EXCEL_EXTENSION_URL must be an HTTPS URL (got "${addInUrl}"): Office ` +
        "refuses to load a task pane, or any dialog page, over plain HTTP."
    );
  }

  const dustUrl = resolveEnvVar(fileVars, "DUST_US_URL");

  if (!isDevelopment) {
    return { apiProxyTarget: null, vars: fileVars };
  }

  return {
    apiProxyTarget: dustUrl,
    vars: {
      ...fileVars,
      DUST_US_URL: addInUrl,
      DUST_EU_URL: addInUrl,
      DUST_API_URL_US: addInUrl,
      DUST_API_URL_EU: addInUrl,
      DUST_API_URL_CELL_00002: addInUrl,
    },
  };
};

/**
 * Replaces `process.env.<KEY>` for every variable resolved above.
 *
 * Also stubs bare `process.env`, which is what `dotenv-webpack` does and is not
 * optional: webpack 5 no longer polyfills `process`, so any `process.env.FOO`
 * this map does not cover — the shared `front` code references a good number of
 * them — would throw `ReferenceError: process is not defined` at runtime and
 * take the whole task pane down with it. Reading a property off the stub string
 * yields `undefined`, which is what those call sites already handle.
 */
const defineEnvVars = (vars: Record<string, string>): Record<string, string> =>
  Object.fromEntries([
    ["process.env", '"MISSING_ENV_VAR"'],
    ...Object.entries(vars).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  ]);

/**
 * Derives the manifest's fourth version component from its own content.
 *
 * Office caches the parsed manifest under `<Id>_<Version>` and will not re-read
 * a sideloaded manifest whose version it already holds, so editing
 * `AppDomains` (or any other manifest field) without changing the version
 * leaves the *old* manifest in force — with no signal beyond the flow failing
 * exactly as it did before. Feeding a content hash into the revision makes the
 * cache key move whenever the manifest does.
 *
 * Kept to development. A release build has to stay monotonic for the Office
 * Store, and its manifest only changes when the package version does.
 */
const toManifestRevision = (manifestWithoutVersion: string): number => {
  let hash = 0;
  for (const char of manifestWithoutVersion) {
    // Cheap FNV-style rolling hash, kept in 32 bits.
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  // Office rejects a version component above 65535.
  return hash % 65536;
};

/**
 * Converts the extension's package version into a manifest `<Version>`.
 *
 * Office requires four parts and rejects anything below 1.0, while the
 * extension package is still on a 0.x line, so the major is offset by one:
 * `0.1.15` becomes `1.1.15.0`. The mapping keeps package.json as the single
 * source of truth and stays monotonic across a major bump.
 */
const toManifestVersion = (version: string, revision: number): string => {
  const [major, minor, patch] = version.split(".");

  return `${Number(major) + 1}.${minor ?? 0}.${patch ?? 0}.${revision}`;
};

/**
 * Compiles the OAuth relay (`auth.ts`) and emits it as `auth.js`.
 *
 * It is deliberately not a webpack entry. `webpack-dev-server` injects its
 * client into *every* entry point — it registers one `EntryPlugin` with
 * `name: undefined`, which webpack applies globally, so there is no per-entry
 * opt-out — and the relay is the page an Office dialog runs. Inside a dialog
 * that client's reload path fires repeatedly (observed at roughly ten reloads
 * a second), and the host reports a page that keeps reloading as one it cannot
 * load: error 12002, which breaks sign-in outright.
 *
 * Emitting it as an asset keeps it in webpack's output — so the production zip
 * still contains it — while leaving it out of the entry graph the dev-server
 * client is attached to. The relay imports nothing, so esbuild needs no
 * resolution config beyond the `process.env` substitutions webpack applies to
 * the rest of the bundle.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] relay-script-is-not-a-dev-server-entry
 * The page an Office dialog loads must never be a `webpack-dev-server` entry
 * point: the injected client reloads the dialog in a loop and the host then
 * refuses the page with error 12002. Compile it separately and emit it as an
 * asset, as `RelayScriptPlugin` does.
 */
class RelayScriptPlugin {
  private readonly define: Record<string, string>;
  private readonly isDevelopment: boolean;

  constructor({
    define,
    isDevelopment,
  }: {
    define: Record<string, string>;
    isDevelopment: boolean;
  }) {
    this.define = define;
    this.isDevelopment = isDevelopment;
  }

  apply(compiler: webpack.Compiler) {
    const sourcePath = resolvePath("./auth.ts");

    compiler.hooks.thisCompilation.tap(
      "RelayScriptPlugin",
      (compilation: webpack.Compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "RelayScriptPlugin",
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            // Rebuild the relay whenever it changes, the way an entry would.
            compilation.fileDependencies.add(sourcePath);

            try {
              const result = esbuild.buildSync({
                entryPoints: [sourcePath],
                bundle: true,
                write: false,
                format: "iife",
                target: "es2020",
                minify: !this.isDevelopment,
                sourcemap: this.isDevelopment ? "inline" : false,
                define: this.define,
              });

              compilation.emitAsset(
                "auth.js",
                new webpack.sources.RawSource(result.outputFiles[0].text)
              );
            } catch (e) {
              compilation.errors.push(
                new webpack.WebpackError(
                  `Could not compile the OAuth relay: ${String(e)}`
                )
              );
            }
          }
        );
      }
    );
  }
}

/**
 * Office add-in manifests hard-code absolute URLs, so the manifest is generated
 * per environment from `manifest.base.xml`. Returns the built manifest XML.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] manifest-urls-follow-addin-url
 * Every add-in URL in the generated manifest — `SourceLocation`, icons and
 * `Resources` entries — resolves from the built environment's
 * `EXCEL_EXTENSION_URL`, and `buildManifest` throws when that variable is unset
 * or not HTTPS.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:security] app-domains-cover-every-sign-in-hop
 * `AppDomains` must list the exact HTTPS origin of every page the sign-in
 * dialog navigates to, including the AuthKit UI host. Office matches an
 * `AppDomain` by origin and does not cover subdomains, so a parent domain does
 * not stand in for one; a missing origin makes the dialog fail with error
 * 12002 and Office's generic "we can't load the add-in" screen.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] dev-manifest-version-tracks-its-content
 * In development, two manifests that differ must not share a `<Version>`:
 * Office caches the parsed manifest under `<Id>_<Version>` and silently keeps
 * serving the cached copy otherwise, so a manifest edit would appear to have no
 * effect. `buildManifest` therefore derives the revision component from the
 * generated XML.
 */
const buildManifest = ({
  env,
  envVars,
  version,
  extraAppDomains,
}: {
  env: Environment;
  envVars: Record<string, string>;
  version: string;
  extraAppDomains: string[];
}): string => {
  const addInUrl = resolveEnvVar(envVars, "EXCEL_EXTENSION_URL");

  const { id, displayName } = JSON.parse(
    fs.readFileSync(resolvePath(`./manifests/manifest.${env}.json`), "utf8")
  );

  // Every host the sign-in dialog navigates through has to be declared, as an
  // exact origin: an `AppDomain` does not cover subdomains, so a bare
  // `authkit.app` entry matches none of the hosts the flow actually visits.
  //
  // The hops are: `/api/workos/login` on the Dust origin, which redirects to
  // `auth-api.dust.tt` (Dust's WorkOS custom domain), which redirects to the
  // AuthKit sign-in UI — a per-environment origin, hence `WORKOS_AUTHKIT_URL`.
  // Third-party providers (Google, Okta, …) redirect within the dialog and need
  // no entry.
  const appDomains = [
    resolveEnvVar(envVars, "DUST_US_URL"),
    resolveEnvVar(envVars, "DUST_EU_URL"),
    resolveEnvVar(envVars, "WORKOS_AUTHKIT_URL"),
    "https://auth-api.dust.tt",
    "https://api.workos.com",
    ...extraAppDomains,
  ]
    .filter(Boolean)
    .map((url) => new URL(url).origin);

  const appDomainElements = [...new Set(appDomains)]
    .map((origin) => `    <AppDomain>${origin}</AppDomain>`)
    .join("\n");

  // Substituted in two passes: the version is derived from the rest of the
  // manifest, so everything else has to be in place before it is known.
  const manifestWithoutVersion = fs
    .readFileSync(resolvePath("./manifests/manifest.base.xml"), "utf8")
    .replace(/__ADDIN_ID__/g, id)
    .replace(/__ADDIN_DISPLAY_NAME__/g, displayName)
    .replace(/__ADDIN_URL__/g, addInUrl.replace(/\/$/, ""))
    .replace(/^__APP_DOMAINS__$/m, appDomainElements);

  const revision =
    env === "development" ? toManifestRevision(manifestWithoutVersion) : 0;

  return manifestWithoutVersion.replace(
    /__ADDIN_VERSION__/g,
    toManifestVersion(version, revision)
  );
};

/** WorkOS's API host, which every environment's sign-in redirects through. */
const WORKOS_API_ORIGIN = "https://auth-api.dust.tt";

/** Prefix on the add-in's own origin standing in for WorkOS's API host. */
const WORKOS_API_PREFIX = "/__wos";

/**
 * Port the AuthKit mirror listens on.
 *
 * It gets a whole origin rather than a path prefix on 3013 because the AuthKit
 * app's URLs are root-relative; see platforms/excel/sign_in_proxy.ts.
 */
const SIGN_IN_PROXY_PORT = 3014;

/**
 * Proxies the sign-in chain so no hop leaves an origin the WebView will load.
 *
 * An Excel WebView will not load WorkOS's default AuthKit host
 * (`*.authkit.app`), which the dev/staging environment is stuck on because
 * custom AuthKit domains are production-only: an Office dialog fails with error
 * 12002 and a `window.open` popup never leaves `about:blank`, while the very
 * same Cloudflare IPs serve `auth-api.dust.tt` to that WebView without
 * complaint. Nothing at the network layer accounts for it — TLS, Apple's ATS,
 * CSP `frame-ancestors`, bot protection, the User-Agent, the `_host_Info` query
 * Office appends, and the `.app` TLD were each ruled out by measurement.
 *
 * WorkOS's API host is mirrored under `WORKOS_API_PREFIX` here, since it only
 * ever answers with redirects. The AuthKit host needs a whole origin of its own
 * and is handled by `startSignInProxy`.
 *
 * Production needs none of this: its AuthKit domain is `signin.dust.tt`, which
 * the dialog loads.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] sign-in-hops-stay-on-a-loadable-origin
 * In development every URL the sign-in flow navigates to must resolve to
 * `localhost`. A hop reaching `*.authkit.app` directly is refused by the Excel
 * WebView, so redirect `Location` headers have to be rewritten onto
 * `WORKOS_API_PREFIX` or the `SIGN_IN_PROXY_PORT` origin.
 */
const buildWorkOsApiProxyEntry = ({
  rewrites,
}: {
  rewrites: Array<[upstream: string, local: string]>;
}): unknown => ({
  context: [WORKOS_API_PREFIX],
  target: WORKOS_API_ORIGIN,
  changeOrigin: true,
  secure: true,
  pathRewrite: { [`^${WORKOS_API_PREFIX}`]: "" },
  onProxyReq: (proxyReq: {
    setHeader: (name: string, value: string) => void;
    getHeader: (name: string) => unknown;
  }) => {
    for (const header of ["origin", "referer"]) {
      const value = proxyReq.getHeader(header);
      if (typeof value === "string") {
        proxyReq.setHeader(
          header,
          rewrites.reduce(
            (acc, [upstream, local]) => acc.split(local).join(upstream),
            value
          )
        );
      }
    }
  },
  // Mutating `proxyRes` rather than `res`: http-proxy emits `proxyRes` before
  // the pass that copies headers onto the response.
  onProxyRes: (proxyRes: any) => {
    const location = proxyRes.headers?.location;
    if (typeof location === "string") {
      proxyRes.headers.location = rewrites.reduce(
        (acc, [upstream, local]) => acc.split(upstream).join(local),
        location
      );
    }

    const cookies = proxyRes.headers?.["set-cookie"];
    if (Array.isArray(cookies)) {
      proxyRes.headers["set-cookie"] = cookies.map((cookie: string) =>
        cookie.replace(/;\s*Domain=[^;]*/i, "")
      );
    }
  },
});

export const getConfig = async ({
  env,
  shouldBuild,
}: {
  env: Environment;
  shouldBuild: "none" | "prod" | "analyze";
}) => {
  const isDevelopment = env === "development";
  const packageJson = JSON.parse(
    fs.readFileSync(resolvePath("../../package.json"), "utf8")
  );
  const version = packageJson.version;

  const buildDirPath = resolvePath("./build");

  const packageDirPath =
    shouldBuild === "prod" ? resolvePath("../../packages") : null;

  const { vars: envVars, apiProxyTarget } = resolveEnvVars({
    env,
    isDevelopment,
  });

  const addInUrl = resolveEnvVar(envVars, "EXCEL_EXTENSION_URL").replace(
    /\/$/,
    ""
  );
  const authKitOrigin = resolveEnvVar(envVars, "WORKOS_AUTHKIT_URL").replace(
    /\/$/,
    ""
  );
  const signInProxyOrigin = `https://localhost:${SIGN_IN_PROXY_PORT}`;

  // Upstream sign-in origins and the local origins standing in for them.
  const rewrites: Array<[upstream: string, local: string]> = [
    [authKitOrigin, signInProxyOrigin],
    [WORKOS_API_ORIGIN, `${addInUrl}${WORKOS_API_PREFIX}`],
  ];

  const manifestXml = buildManifest({
    env,
    envVars,
    version,
    // The dialog navigates to the local AuthKit mirror in development.
    extraAppDomains: isDevelopment ? [signInProxyOrigin] : [],
  });
  const httpsServerOptions = isDevelopment
    ? await getHttpsServerOptions()
    : undefined;

  return {
    mode: isDevelopment ? "development" : "production",
    // `source-map`, not `inline-source-map`: inlining the maps as base64 more
    // than doubles the bundle the host WebView has to download and parse
    // (68MB vs 30MB here) for no gain, since the separate `.map` is fetched
    // only when the developer tools are open.
    devtool: isDevelopment ? "source-map" : undefined,
    entry: {
      main: resolvePath("./main.tsx"),
    },
    output: {
      filename: "[name].js",
      chunkFilename: "[id].chunk.js",
      path: buildDirPath,
      publicPath: "/",
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              configFile: resolvePath("../../tsconfig.json"),
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.woff2$/i,
          type: "asset/resource",
          generator: {
            filename: "static/fonts/[name][ext]",
          },
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                modules: {
                  auto: true,
                  namedExport: false,
                },
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: resolvePath("../../config/postcss.config.js"),
                },
              },
            },
          ],
        },
      ],
    },
    // Ignore node_modules AND the build output dir. The Tailwind v4 `@source`
    // globs (e.g. `@source "../../platforms/**/*.{ts,tsx}"`) make the postcss
    // loader register `platforms/**` as a watched context directory, and
    // `devMiddleware.writeToDisk` below writes the manifest into
    // `platforms/excel/build/`. Without this the write re-triggers the watcher
    // on every compile, which live-reloads the task pane every few seconds and
    // makes the dev server stall requests while it rebuilds.
    //
    // Set here rather than in `run/watch.ts`, whose equivalent ignore list only
    // covers the `compiler.watch()` branch this platform does not take.
    watchOptions: {
      ignored: ["**/node_modules/**", "**/build/**"],
    },
    optimization: {
      minimize: !isDevelopment,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            output: {
              ascii_only: true,
            },
          },
        }),
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@extension": resolvePath("../../"),
        "@app/logger/logger": resolvePath(
          "../../../front/logger/datadogLogger.ts"
        ),
        "@app/lib/platform": resolvePath("../../shared/platform"),
        "@app": resolvePath("../../../front"),
      },
      fallback: {
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        url: require.resolve("url/"),
        assert: require.resolve("assert"),
        // Node built-ins reached through shared `front` code that never runs in
        // the task pane; stubbed out rather than polyfilled, as for chrome.
        crypto: false,
        events: false,
        fs: false,
        net: false,
        path: false,
        zlib: false,
      },
    },
    plugins: [
      new WebpackBar({
        name: `DustExcel [${env}]`,
        color: "#217346", // Excel green.
      }),
      new HtmlWebpackPlugin({
        template: resolvePath("./taskpane.html"),
        filename: "taskpane.html",
        chunks: ["main"],
        inject: "body",
        scriptLoading: "blocking",
      }),
      new HtmlWebpackPlugin({
        template: resolvePath("./auth.html"),
        filename: "auth.html",
        // No chunks: the relay script is emitted by `RelayScriptPlugin` and
        // referenced from the template. See that plugin for why.
        chunks: [],
        inject: false,
      }),
      new RelayScriptPlugin({ define: defineEnvVars(envVars), isDevelopment }),
      new CopyPlugin({
        patterns: [
          {
            // `from` is only used to give the plugin something to watch; the
            // emitted content is the generated manifest.
            from: resolvePath("./manifests/manifest.base.xml"),
            to: path.join(buildDirPath, "manifest.xml"),
            transform: () => Buffer.from(manifestXml),
          },
          {
            context: resolvePath("../../ui/images"),
            from: "**/*.png",
            to: path.resolve(buildDirPath, "images"),
          },
        ],
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.DefinePlugin({
        // Expose VITE_* vars on `import.meta.env` so the shared `front`
        // CellProvider can resolve the cell API base URL in the webpack
        // build (Vite only injects these in the SPA).
        "import.meta.env": JSON.stringify(getImportMetaEnvFromVars(envVars)),
        // Stands in for `dotenv-webpack`, which can only read a file: these
        // values are the `.env` file layered with the development overrides
        // from `resolveEnvVars`.
        ...defineEnvVars(envVars),
      }),
      new webpack.EnvironmentPlugin({
        BUILD_DATE: process.env.COMMIT_HASH || Math.floor(Date.now() / 1000),
        COMMIT_HASH: process.env.COMMIT_HASH || getCommitHash(),
        DATADOG_CLIENT_TOKEN: process.env.DATADOG_CLIENT_TOKEN || "",
        DATADOG_ENV: isDevelopment ? "dev" : "prod",
        DUST_EXTENSION_VERSION: `excel-${version}`,
        NEXT_PUBLIC_DUST_APP_URL: process.env.NEXT_PUBLIC_DUST_APP_URL || "",
        NEXT_PUBLIC_DUST_API_URL: process.env.NEXT_PUBLIC_DUST_API_URL || "",
        NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL:
          process.env.NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL || "",
        NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY:
          process.env.NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY || "",
        VIZ_PUBLIC_URL: process.env.VIZ_PUBLIC_URL || "",
      }),
      packageDirPath
        ? new ZipPlugin({
            path: packageDirPath,
            filename: `Dust_Extension_Excel.${env}.v${version}.zip`,
          })
        : null,
    ].filter(Boolean),
    devServer: {
      port: 3013,
      hot: true,
      // Forward Dust API calls to the real backend. See `resolveEnvVars`: the
      // task pane is pointed at its own origin so that these requests are
      // same-origin HTTPS, which an Office WebView allows and a plain-HTTP
      // cross-origin request is not.
      ...(apiProxyTarget
        ? {
            proxy: [
              {
                context: PROXIED_API_PREFIXES,
                target: apiProxyTarget,
                changeOrigin: false,
                secure: false,
                ws: true,
                // Dust answers `/api/workos/login` with a redirect to WorkOS.
                // Point it at the proxied prefix instead, so the dialog stays
                // on this origin. Only the header is touched: `/sse` and
                // `/mcp` stream, and buffering their bodies would break them.
                //
                // Mutating `proxyRes` rather than `res`: http-proxy emits
                // `proxyRes` *before* the pass that copies headers onto the
                // response, so anything set on `res` here is overwritten.
                onProxyRes: (proxyRes: any) => {
                  const location = proxyRes.headers?.location;
                  if (typeof location === "string") {
                    proxyRes.headers.location = location.replace(
                      WORKOS_API_ORIGIN,
                      `${addInUrl}${WORKOS_API_PREFIX}`
                    );
                  }
                },
              },
              ...(authKitOrigin
                ? [buildWorkOsApiProxyEntry({ rewrites })]
                : []),
            ],
          }
        : {}),
      ...(isDevelopment && authKitOrigin && httpsServerOptions
        ? {
            onListening: () => {
              startSignInProxy({
                port: SIGN_IN_PROXY_PORT,
                upstreamOrigin: authKitOrigin,
                serverOptions: httpsServerOptions,
                rewrites,
              });
            },
          }
        : {}),
      // Serve the task pane shell for any in-app path.
      //
      // The task pane runs a memory router (see ExcelApp.tsx) so navigation
      // never needs the network, but the shared `front` hooks still write real
      // URLs through the History API — `/w/<wId>/conversation/new` and the
      // like. A request for one of those otherwise gets the dev server's
      // "Cannot GET" 404, which is what the Front plugin's `historyApiFallback`
      // is there for as well. `index` has to name this platform's shell, since
      // there is no `index.html`.
      //
      // Registered after the proxies, so `/api`, `/sse`, `/mcp` and the
      // sign-in prefixes are untouched.
      historyApiFallback: { index: "/taskpane.html" },
      devMiddleware: {
        // The dev server otherwise keeps its output in memory, but sideloading
        // needs a real manifest file on disk. Only that one is written out —
        // the JS bundle is large and is served from memory as usual.
        writeToDisk: (filePath: string) => filePath.endsWith("manifest.xml"),
      },
      // Excel on desktop loads the task pane in a WebView whose origin differs
      // from the dev server's, so the assets have to be CORS-readable.
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      ...(httpsServerOptions
        ? { server: { type: "https", options: httpsServerOptions } }
        : {}),
      static: {
        directory: buildDirPath,
        // Never watch it. This is webpack's own output directory, and
        // `devMiddleware.writeToDisk` above writes `manifest.xml` into it on
        // every compile, so watching it live-reloads the task pane in response
        // to the add-in's own build.
        //
        // That reload is not a cosmetic annoyance: it destroys the task pane's
        // JS context while a sign-in dialog is open, orphaning the dialog. The
        // host then reports the dialog as a page it could not load (error
        // 12002) and sign-in fails. Source changes still reload the task pane
        // through the compiler, which is what `hot` is for.
        watch: false,
      },
      client: {
        overlay: {
          // Same reasoning as the Front plugin: the overlay cannot be filtered
          // inside an Office WebView, and benign ResizeObserver errors would
          // cover the task pane. Runtime errors still appear in the console.
          runtimeErrors: false,
        },
      },
    },
  };
};
