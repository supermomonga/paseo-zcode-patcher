import fs from "node:fs/promises";
import path from "node:path";

import { sha256File } from "./hashes.js";
import type { OverlayEntry } from "./manifest.js";

async function assertRegularFile(target: string, label: string): Promise<void> {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
}

export async function verifyResourceEntries(
  resourcesRoot: string,
  entries: OverlayEntry[],
  expected: "original" | "patched",
): Promise<void> {
  for (const entry of entries) {
    const target = path.join(resourcesRoot, entry.path);
    await assertRegularFile(target, `resource '${entry.path}'`);
    const expectedHash =
      expected === "original" ? entry.originalSha256 : entry.sha256;
    if (expectedHash === null) {
      throw new Error(`resource '${entry.path}' must replace an existing file`);
    }
    const actualHash = await sha256File(target);
    if (actualHash !== expectedHash) {
      throw new Error(
        `${expected} resource hash mismatch for '${entry.path}': ${actualHash}`,
      );
    }
  }
}

export async function applyResourceOverlay(
  resourcesRoot: string,
  artifactDirectory: string,
  entries: OverlayEntry[],
): Promise<void> {
  await verifyResourceEntries(resourcesRoot, entries, "original");
  for (const entry of entries) {
    const source = path.join(artifactDirectory, "overlay", entry.source);
    await assertRegularFile(source, `overlay '${entry.source}'`);
    if ((await sha256File(source)) !== entry.sha256) {
      throw new Error(`overlay hash mismatch for '${entry.path}'`);
    }
    await fs.copyFile(source, path.join(resourcesRoot, entry.path));
  }
  await verifyResourceEntries(resourcesRoot, entries, "patched");
}
