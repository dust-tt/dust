import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import canarySchema from "../../../x/jd/dfs-fdb/import/config/canary.schema.json";
import relaySchema from "../../../x/jd/dfs-fdb/import/config/relay.schema.json";
import workerSchema from "../../../x/jd/dfs-fdb/import/config/worker.schema.json";
import canary from "./fixtures/helm/canary.json";
import relay from "./fixtures/helm/relay.json";
import worker from "./fixtures/helm/worker.json";

import { CanaryConfigSchema } from "@app/workers/gcs_dfs/canary";
import { ConfigSchema, RelayConfigSchema } from "@app/workers/gcs_dfs/protocol";

describe("GCS DFS deployment configuration fixtures", () => {
  it("accepts the canary fixture including runtime-only refinements", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(canarySchema);
    expect(validate(canary), JSON.stringify(validate.errors)).toBe(true);
    const result = CanaryConfigSchema.safeParse(canary);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("checks the same source binding and queues with separate reader credentials", () => {
    const canaryConfig = CanaryConfigSchema.parse(canary);
    const relayConfig = RelayConfigSchema.parse(relay);
    const workerConfig = ConfigSchema.parse(worker);
    const {
      tokenFile,
      readers,
      writerSubject,
      stagingDirectoryId,
      ...sourceBinding
    } = workerConfig.bindings[0];
    expect(canaryConfig.binding).toEqual({
      ...sourceBinding,
      allowedReaderTokenFile: "/etc/gcs-dfs/canary-tokens/allowed",
      deniedReaderTokenFile: "/etc/gcs-dfs/canary-tokens/denied",
    });
    expect(writerSubject).toBeTruthy();
    expect(stagingDirectoryId).not.toBe(sourceBinding.directoryId);
    expect(readers).toEqual(["reader-test"]);
    expect(canaryConfig.binding.allowedReaderTokenFile).not.toBe(tokenFile);
    expect(canaryConfig.binding.deniedReaderTokenFile).not.toBe(tokenFile);
    expect(canaryConfig.relay.subscription).toBe(relayConfig.subscription);
    expect(canaryConfig.worker.subscription).toBe(workerConfig.subscription);
    expect(canaryConfig.worker.topic).toBe(relayConfig.topic);
    for (const config of [relayConfig, workerConfig]) {
      expect(canaryConfig).toMatchObject({
        environment: config.environment,
        cell: config.cell,
        pubsubEndpoint: config.pubsubEndpoint,
      });
    }
  });

  it("accepts the relay fixture in the generated JSON schema and runtime validator", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(relaySchema);
    expect(validate(relay), JSON.stringify(validate.errors)).toBe(true);
    expect(RelayConfigSchema.safeParse(relay).success).toBe(true);
  });

  it("accepts the importer fixture in the generated JSON schema and runtime validator", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(workerSchema);
    expect(validate(worker), JSON.stringify(validate.errors)).toBe(true);
    expect(ConfigSchema.safeParse(worker).success).toBe(true);
  });

  it("preserves matching trusted routing across hops without importer authority in the relay", () => {
    const relayConfig = RelayConfigSchema.parse(relay);
    const workerConfig = ConfigSchema.parse(worker);
    expect(relayConfig.bindings).toEqual(
      workerConfig.bindings.map(
        ({ workspaceId, bucket, prefix, notificationConfigs }) => ({
          workspaceId,
          bucket,
          prefix,
          notificationConfigs,
        })
      )
    );
    expect(relayConfig.subscription).not.toBe(workerConfig.subscription);
    expect(workerConfig.bindings[0].tokenFile).toBe(
      "/etc/gcs-dfs/tokens/test-token"
    );
    expect(workerConfig.orderedDelivery).toBe(true);
    for (const rendered of [relay, worker]) {
      expect(rendered).toMatchObject({
        environment: "development",
        cell: "cell-99999",
        pubsubEndpoint: "https://europe-west1-pubsub.googleapis.com",
        healthPort: 3001,
        drainTimeoutMs: 60000,
      });
    }
  });
});
