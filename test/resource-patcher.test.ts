import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { sha256Buffer } from "../src/hashes.js";
import type { OverlayEntry } from "../src/manifest.js";
import {
  applyResourceOverlay,
  verifyResourceEntries,
} from "../src/resource-patcher.js";

const temporaryDirectories: string[] = [];

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "paseo-zcode-resource-"),
  );
  temporaryDirectories.push(root);
  const resources = path.join(root, "bundle", "Contents", "Resources");
  const artifacts = path.join(root, "artifacts");
  const target = "app-dist/main.js";
  const source = `resources/${target}`;
  await fs.mkdir(path.join(resources, "app-dist"), { recursive: true });
  await fs.mkdir(path.join(artifacts, "overlay", "resources", "app-dist"), {
    recursive: true,
  });
  await fs.writeFile(path.join(resources, target), "original");
  await fs.writeFile(path.join(artifacts, "overlay", source), "patched");
  const entry: OverlayEntry = {
    path: target,
    source,
    sha256: sha256Buffer("patched"),
    originalSha256: sha256Buffer("original"),
  };
  return { resources, artifacts, entry };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("resource overlay", () => {
  it("replaces and verifies a fixed existing application resource", async () => {
    const { resources, artifacts, entry } = await fixture();
    await verifyResourceEntries(resources, [entry], "original");
    await applyResourceOverlay(resources, artifacts, [entry]);
    await expect(
      fs.readFile(path.join(resources, entry.path), "utf8"),
    ).resolves.toBe("patched");
    await verifyResourceEntries(resources, [entry], "patched");
  });

  it("rejects an unexpected original before changing it", async () => {
    const { resources, artifacts, entry } = await fixture();
    await fs.writeFile(path.join(resources, entry.path), "unexpected");
    await expect(
      applyResourceOverlay(resources, artifacts, [entry]),
    ).rejects.toThrow(/original resource hash mismatch/u);
    await expect(
      fs.readFile(path.join(resources, entry.path), "utf8"),
    ).resolves.toBe("unexpected");
  });
});
