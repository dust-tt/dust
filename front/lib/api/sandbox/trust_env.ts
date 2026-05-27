// Trust-bundle env vars exported on every sandbox process. Canonical source
// of truth shared by:
//   - SandboxResource.buildSandboxEnvVars (sets them on the agent process)
//   - setupEgressForwarder (strips them from dsbx's own env via `env -u`)
//   - dust-trust.environment / dust-trust.sh (image-baked defaults)
//
// The image-baked files and this object must stay in sync. The test in
// front/lib/api/sandbox/image/registry.test.ts asserts the file contents
// match these values; the test in front/lib/api/sandbox/egress.test.ts
// asserts every key here is stripped from dsbx's env.
export const SANDBOX_TRUST_ENV_VARS: Record<string, string> = {
  SSL_CERT_FILE: "/etc/dust/ca-bundle.pem",
  SSL_CERT_DIR: "/etc/ssl/certs",
  CURL_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
  REQUESTS_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
  AWS_CA_BUNDLE: "/etc/dust/ca-bundle.pem",
  GIT_SSL_CAINFO: "/etc/dust/ca-bundle.pem",
  NODE_EXTRA_CA_CERTS: "/run/dust/egress-ca.pem",
  DENO_CERT: "/run/dust/egress-ca.pem",
  DENO_TLS_CA_STORE: "system,mozilla",
  JAVA_TOOL_OPTIONS:
    "-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts -Djavax.net.ssl.trustStorePassword=changeit",
};
