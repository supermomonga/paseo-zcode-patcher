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

describe("release artifact", () => {
  it("verifies every overlay entry and the fixed ZCode contract", async () => {
    const manifest = await loadManifest(artifactDirectory);
    expect(manifest.paseo).toMatchObject({
      version: "0.7.2",
      commit: "9400a49af670fdb5db4af58e73f8df98588dbea9",
      sourceAsarSha256:
        "67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b",
      patchedAsarSha256:
        "6c3531db45cb75e9c2efd9748527c8cdb462ab13c10c8e5455e430ac369242c8",
    });
    expect(manifest.zcode).toMatchObject({
      appVersion: "3.11.2",
      cliVersion: "0.16.5",
      artifact: "zcode-host-3.11.2",
      protocol: "zcode-task-v1",
      requiredExports: ["g", "i", "j"],
    });
    expect(manifest.entries).toHaveLength(18);
    expect(manifest.overlayHash).toBe(
      "af28209c4bbb26c4bab2901feb2cb52d28e82dc3327f2b22d204005f5fdce5d4",
    );
    expect(
      manifest.entries.some((entry) =>
        /(?:renderer|\.test\.js$|\.map$|agentclientprotocol|acp-agent)/u.test(
          entry.path,
        ),
      ),
    ).toBe(false);
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
      /(?:Bearer\s|access[_-]?token|refresh[_-]?token|BEGIN [A-Z ]*PRIVATE KEY|PROMPT_MUST_NOT_BE_LOGGED)/iu,
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
