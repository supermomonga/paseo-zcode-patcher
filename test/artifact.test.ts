import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadManifest, markerContents } from "../src/manifest.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const artifactDirectory = path.join(
  repositoryRoot,
  "artifacts",
  "paseo-0.7.2-arm64",
);

describe("locally generated artifact", () => {
  it("verifies every overlay entry and the fixed ZCode contract", async () => {
    const manifest = await loadManifest(artifactDirectory);
    expect(manifest.paseo).toMatchObject({
      version: "0.7.2",
      commit: "9400a49af670fdb5db4af58e73f8df98588dbea9",
      sourceAsarSha256:
        "67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b",
      patchedAsarSha256:
        "047ef7bd7c061e2fbaedb73c411c0e611fea6306c3cf674d9e5001b69229d534",
    });
    expect(manifest.zcode).toMatchObject({
      appVersion: "3.11.2",
      cliVersion: "0.16.5",
      artifact: "zcode-host-3.11.2",
      protocol: "zcode-task-v1",
      requiredExports: ["g", "i", "j"],
    });
    expect(manifest.entries).toHaveLength(26);
    expect(manifest.overlayHash).toBe(
      "be8c60fbdd29c50724d8ecfb133e2cc6b6f1be479e0a7fb732dd5cf03442478e",
    );
    for (const suffix of [
      "protocol/dist/messages.js",
      "protocol/dist/generated/validation/ws-outbound.aot.js",
      "client/dist/daemon-client.js",
      "server/agent/agent-manager.js",
      "server/session.js",
      "server/session/provider/provider-catalog-session.js",
      "providers/zcode/usage.js",
    ]) {
      expect(
        manifest.entries.some((entry) => entry.path.endsWith(suffix)),
      ).toBe(true);
    }
    expect(
      manifest.entries.some((entry) =>
        /(?:renderer|\.test\.js$|\.map$|agentclientprotocol|acp-agent)/u.test(
          entry.path,
        ),
      ),
    ).toBe(false);
    expect(manifest.resourceEntries).toEqual([
      {
        path: "app-dist/_expo/static/js/web/index-a14e171f25e905c272fe59b4f86aca06.js",
        source:
          "resources/app-dist/_expo/static/js/web/index-a14e171f25e905c272fe59b4f86aca06.js",
        sha256:
          "0449533ce96288b2771b5646a38844fed6e25749acf74927a4a2635234670160",
        originalSha256:
          "e0bf84a5218b90f1575ead487f4cce8d20f06027eb76df1a9efdef9283c2cdc8",
      },
    ]);
    expect(
      manifest.entries.filter((entry) =>
        entry.path.endsWith("/provider-registry.js"),
      ),
    ).toHaveLength(1);
    expect(
      manifest.entries.filter((entry) =>
        entry.path.includes("/providers/zcode/agent.js"),
      ),
    ).toHaveLength(1);
  });

  it("creates a marker without timestamps or machine-specific paths", async () => {
    const marker = markerContents(
      await loadManifest(artifactDirectory),
    ).toString("utf8");
    expect(marker).not.toContain("createdAt");
    expect(marker).not.toContain(repositoryRoot);
    expect(JSON.parse(marker)).toMatchObject({
      patcherVersion: "0.1.0",
      paseoVersion: "0.7.2",
      zcodeArtifact: "zcode-host-3.11.2",
      zcodeProtocol: "zcode-task-v1",
      patchFormat: "header-preserving-append-v1",
    });
  });

  it("contains no application bundle, credential, or secret fixture", async () => {
    const files = await regularFiles(artifactDirectory);
    expect(files.every((file) => !file.endsWith(".app"))).toBe(true);
    const contents = Buffer.concat(
      await Promise.all(files.map(async (file) => await fs.readFile(file))),
    ).toString("utf8");
    expect(contents).not.toMatch(
      /(?:Bearer\s+[A-Za-z0-9._~+/-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|PROMPT_MUST_NOT_BE_LOGGED)/u,
    );
  });
});

async function regularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  }
  await visit(root);
  return result;
}
