import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { sha256File } from "../src/hashes.js";
import { runCommand } from "../src/system.js";

export async function downloadSourceArchive(
  source: { url: string; sha256: string },
  destination: string,
): Promise<void> {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "paseo-zcode-source-"),
  );
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || response.body === null) {
      await response.body?.cancel();
      throw new Error(`Paseo source download failed: HTTP ${response.status}`);
    }
    const archive = path.join(temporaryDirectory, "source.tar.gz");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    if ((await sha256File(archive)) !== source.sha256) {
      throw new Error(
        "Paseo source archive SHA-256 mismatch; refusing to extract",
      );
    }
    await runCommand("tar", [
      "-xzf",
      archive,
      "--strip-components=1",
      "-C",
      destination,
    ]);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
