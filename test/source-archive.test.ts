import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadSourceArchive } from "../scripts/source-archive.js";
import { sha256Buffer } from "../src/hashes.js";

let root: string;
let destination: string;
let archive: Buffer;
const url = "https://example.invalid/pinned-source.tar.gz";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "source-archive-test-"));
  destination = path.join(root, "destination");
  const source = path.join(root, "paseo-fixed-commit");
  await fs.mkdir(destination);
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "package.json"), '{"name":"paseo"}\n');
  execFileSync("tar", [
    "-czf",
    path.join(root, "source.tar.gz"),
    "-C",
    root,
    "paseo-fixed-commit",
  ]);
  archive = await fs.readFile(path.join(root, "source.tar.gz"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(root, { recursive: true, force: true });
});

describe("verified source download", () => {
  it("extracts a verified archive without its enclosing directory", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(archive)));
    vi.stubGlobal("fetch", fetch);
    await downloadSourceArchive(
      { url, sha256: sha256Buffer(archive) },
      destination,
    );
    expect(fetch).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
    });
    expect(await fs.readdir(destination)).toEqual(["package.json"]);
    expect(
      await fs.readFile(path.join(destination, "package.json"), "utf8"),
    ).toBe('{"name":"paseo"}\n');
  });

  it("rejects a changed archive before extracting any files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(archive))),
    );
    await expect(
      downloadSourceArchive({ url, sha256: "0".repeat(64) }, destination),
    ).rejects.toThrow("SHA-256 mismatch");
    expect(await fs.readdir(destination)).toEqual([]);
  });

  it("rejects HTTP errors without extracting the error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    await expect(
      downloadSourceArchive(
        { url, sha256: sha256Buffer(archive) },
        destination,
      ),
    ).rejects.toThrow("HTTP 503");
    expect(await fs.readdir(destination)).toEqual([]);
  });

  it("propagates network failure without a replacement source", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connection failed"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      downloadSourceArchive(
        { url, sha256: sha256Buffer(archive) },
        destination,
      ),
    ).rejects.toThrow("connection failed");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(destination)).toEqual([]);
  });

  it("reports extraction failure even when the download hash matches", async () => {
    const invalidArchive = Buffer.from("not a tar archive");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(invalidArchive)),
    );
    await expect(
      downloadSourceArchive(
        { url, sha256: sha256Buffer(invalidArchive) },
        destination,
      ),
    ).rejects.toThrow("tar exited with");
  });
});
