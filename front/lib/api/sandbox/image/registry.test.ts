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

function getCopyOperations(
  operations: readonly Operation[]
): Extract<Operation, { type: "copy" }>[] {
  return operations.flatMap((operation) =>
    operation.type === "copy" ? [operation] : []
  );
}

function getCopiedContent(
  copyOperations: readonly Extract<Operation, { type: "copy" }>[],
  dest: string
): string {
  const operation = copyOperations.find(
    (copyOperation) => copyOperation.dest === dest
  );
  expect(operation).toBeDefined();
  expect(operation?.src.type).toBe("content");

  if (!operation || operation.src.type !== "content") {
    throw new Error(`missing copied content for ${dest}`);
  }

  const content = operation.src.getContent();
  return typeof content === "string" ? content : content.toString("utf-8");
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

    expect(dockerfile).toContain("netcat-openbsd nftables acl");
    expect(dockerfile).toContain("mkdir -p /etc/dust");
    expect(dockerfile).toContain("command -v sudo >/dev/null 2>&1");
  });

  test("registers the PR1 sandbox image versions", () => {
    const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });

    expect(imageResult.isOk()).toBe(true);
    if (imageResult.isOk()) {
      expect(imageResult.value.baseImage).toEqual({
        type: "docker",
        imageRef: "dust-sbx-bedrock:1.7.0",
      });
      expect(imageResult.value.imageId).toEqual({
        imageName: "dust-base",
        tag: "0.7.11",
      });
    }
  });

  test("creates the dormant proxied user and shared-path permissions", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);

    expect(runCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "useradd --create-home --uid 1003 --gid agent --shell /bin/bash agent-proxied"
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

  test("copies the nftables boot assets and enables the systemd oneshot", () => {
    const operations = getDustBaseImageOperations();
    const runCommands = getRunCommands(operations);
    const copyOperations = getCopyOperations(operations);
    const nftablesScript = getCopiedContent(
      copyOperations,
      "/etc/dust/egress-nftables.sh"
    );
    const serviceUnit = getCopiedContent(
      copyOperations,
      "/etc/systemd/system/dust-egress-nftables.service"
    );

    expect(runCommands).toEqual(
      expect.arrayContaining([
        "chmod 755 /etc/dust/egress-nftables.sh",
        "systemctl daemon-reload && systemctl enable dust-egress-nftables.service",
      ])
    );

    expect(runCommands.join("\n")).not.toContain(
      "chmod 755 /etc/dust/egress-nftables.sh && /etc/dust/egress-nftables.sh"
    );
    expect(runCommands.join("\n")).not.toContain("iptables");

    expect(serviceUnit).toContain(
      "Description=Dust egress nftables rules for agent-proxied"
    );
    expect(serviceUnit).toContain("Type=oneshot");
    expect(serviceUnit).toContain("RemainAfterExit=yes");
    expect(serviceUnit).toContain("ExecStart=/etc/dust/egress-nftables.sh");
    expect(serviceUnit).toContain("WantedBy=multi-user.target");

    expect(nftablesScript).toContain("nft add table ip dust-egress");
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress nat_output '{ type nat hook output priority -100 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add chain ip dust-egress filter_output '{ type filter hook output priority 0 ; policy accept ; }'"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID ip daddr 127.0.0.0/8 return"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress nat_output meta skuid $PROXIED_UID tcp dport != 0 redirect to :9990"
    );
    expect(nftablesScript).toContain(
      'nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID udp dport 53 ip daddr "$NS" accept'
    );
    expect(nftablesScript).toContain(
      "nft add rule ip dust-egress filter_output meta skuid $PROXIED_UID ip daddr 169.254.169.254 drop"
    );
    expect(nftablesScript).toContain(
      "nft add rule ip6 dust-egress filter_output meta skuid $PROXIED_UID drop"
    );
  });
});
