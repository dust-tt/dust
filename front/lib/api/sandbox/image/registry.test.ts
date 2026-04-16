import { getSandboxImageFromRegistry } from "@app/lib/api/sandbox/image/registry";
import type { Operation } from "@app/lib/api/sandbox/image/types";
import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";

function getDustBaseImageOperations(): readonly Operation[] {
  const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
  if (imageResult.isErr()) {
    throw imageResult.error;
  }

  return imageResult.value.operations;
}

function getRunCommands(operations: readonly Operation[]): string[] {
  return operations.flatMap((operation) =>
    operation.type === "run" ? [operation.command] : []
  );
}

function getSandboxBedrockDockerfile(): string {
  const dockerfilePath = path.resolve(
    __dirname,
    "../../../../../dockerfiles/sandbox-bedrock.Dockerfile"
  );

  return fs.readFileSync(dockerfilePath, "utf-8");
}

describe("sandbox image registry", () => {
  test("adds the PR1 base-image primitives to the sandbox bedrock Dockerfile", () => {
    const dockerfile = getSandboxBedrockDockerfile();

    expect(dockerfile).toContain("netcat-openbsd iptables acl");
    expect(dockerfile).toContain(
      "useradd --system --no-create-home --uid 9990 --shell /usr/sbin/nologin dust-fwd"
    );
    expect(dockerfile).toContain("mkdir -p /etc/dust");
  });

  test("registers the PR1 sandbox image versions", () => {
    const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });

    expect(imageResult.isOk()).toBe(true);
    if (imageResult.isOk()) {
      expect(imageResult.value.baseImage).toEqual({
        type: "docker",
        imageRef: "dust-sbx-bedrock:1.5.0",
      });
      expect(imageResult.value.imageId).toEqual({
        imageName: "dust-base",
        tag: "0.7.5",
      });
    }
  });

  test("creates the dormant proxied user and shared-path permissions", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "useradd --create-home --uid 1001 --gid agent --shell /bin/bash agent-proxied"
        ),
        expect.stringContaining("chgrp agent /home/agent /files/conversation"),
        expect.stringContaining("chmod g+ws /home/agent /files/conversation"),
        expect.stringContaining(
          "setfacl -R -d -m g::rwx /home/agent /files/conversation"
        ),
        expect.stringContaining(
          "setfacl -R -m g::rwx /home/agent /files/conversation"
        ),
      ])
    );
  });

  test("bakes uid-scoped iptables rules and the sudo invariant into the template", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);

    expect(runCommands).toEqual(
      expect.arrayContaining([
        // Loopback exemption lives in nat (before REDIRECT), not filter —
        // otherwise the redirect rewrites the destination first.
        expect.stringContaining(
          "iptables -t nat -A OUTPUT -m owner --uid-owner 1001 -d 127.0.0.0/8 -j RETURN"
        ),
        // Metadata + RFC1918 RETURNs in nat keep original dst intact for
        // the filter-table defense-in-depth DROPs below.
        expect.stringContaining(
          "iptables -t nat -A OUTPUT -m owner --uid-owner 1001 -d 169.254.169.254/32 -j RETURN"
        ),
        expect.stringContaining(
          "iptables -t nat -A OUTPUT -m owner --uid-owner 1001 -d 10.0.0.0/8 -j RETURN"
        ),
        expect.stringContaining(
          "iptables -t nat -A OUTPUT -m owner --uid-owner 1001 -p tcp -j REDIRECT --to-ports 9990"
        ),
        expect.stringContaining(
          'iptables -A OUTPUT -m owner --uid-owner 1001 -p udp --dport 53 -d "$NS" -j ACCEPT'
        ),
        expect.stringContaining(
          "iptables -A OUTPUT -m owner --uid-owner 1001 -d 169.254.169.254/32 -j DROP"
        ),
        expect.stringContaining(
          "ip6tables -A OUTPUT -m owner --uid-owner 1001 -j DROP"
        ),
        expect.stringContaining("command -v sudo >/dev/null 2>&1"),
      ])
    );
  });
});
