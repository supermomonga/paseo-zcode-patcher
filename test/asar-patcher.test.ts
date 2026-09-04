import { createPackageWithOptions, getRawHeader } from "@electron/asar";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  encodeAsarHeader,
  patchAsar,
  rawAsarHeader,
  readAsarEntry,
  type AsarDirectory,
} from "../src/asar-patcher.js";
import { computeOverlayHash, sha256Buffer, sha256File } from "../src/hashes.js";
import type { OverlayEntry } from "../src/manifest.js";
import { manifestFixture } from "./fixtures.js";

const temporaryDirectories: string[] = [];

function nodeAt(
  header: AsarDirectory,
  entryPath: string,
): Record<string, unknown> {
  let node = header as unknown as Record<string, unknown>;
  for (const part of entryPath.split("/")) {
    node = (node.files as Record<string, Record<string, unknown>>)[part]!;
  }
  return node;
}

async function fixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "paseo-zcode-asar-"),
  );
  temporaryDirectories.push(directory);
  const sourceDirectory = path.join(directory, "source");
  const artifactDirectory = path.join(directory, "artifact");
  const overlayDirectory = path.join(artifactDirectory, "overlay");
  await fs.mkdir(sourceDirectory);
  await fs.mkdir(overlayDirectory, { recursive: true });
  await fs.writeFile(path.join(sourceDirectory, "replace.txt"), "original");
  await fs.writeFile(path.join(sourceDirectory, "untouched.txt"), "untouched");
  await fs.writeFile(path.join(sourceDirectory, "missing.txt"), "unpacked");
  const sourceAsar = path.join(directory, "source.asar");
  await createPackageWithOptions(sourceDirectory, sourceAsar, {
    unpack: "missing.txt",
  });
  await fs.rm(`${sourceAsar}.unpacked/missing.txt`);

  const raw = getRawHeader(sourceAsar);
  const original = await fs.readFile(sourceAsar);
  const header = raw.header as AsarDirectory;
  (header as unknown as Record<string, unknown>).customRootMetadata = {
    retained: true,
  };
  nodeAt(header, "untouched.txt").customEntryMetadata = "retained";
  await fs.writeFile(
    sourceAsar,
    Buffer.concat([
      encodeAsarHeader(header),
      original.subarray(8 + raw.headerSize),
    ]),
  );

  const replacement = Buffer.from("replacement");
  await fs.writeFile(path.join(overlayDirectory, "replace.txt"), replacement);
  const entry: OverlayEntry = {
    path: "replace.txt",
    source: "replace.txt",
    sha256: sha256Buffer(replacement),
    originalSha256: sha256Buffer(Buffer.from("original")),
  };
  const manifest = manifestFixture(await sha256File(sourceAsar));
  manifest.entries = [entry];
  manifest.overlayHash = computeOverlayHash(manifest.entries);
  return { directory, sourceAsar, artifactDirectory, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("header-preserving ASAR patch", () => {
  it("preserves packed data and unrelated header metadata", async () => {
    const testFixture = await fixture();
    const output = path.join(testFixture.directory, "patched.asar");
    const sourceRaw = getRawHeader(testFixture.sourceAsar);
    const sourceBytes = await fs.readFile(testFixture.sourceAsar);
    const sourceData = sourceBytes.subarray(8 + sourceRaw.headerSize);
    const sourceHeader = rawAsarHeader(testFixture.sourceAsar);

    await patchAsar(
      testFixture.sourceAsar,
      output,
      testFixture.artifactDirectory,
      testFixture.manifest,
    );

    const outputRaw = getRawHeader(output);
    const outputBytes = await fs.readFile(output);
    expect(
      outputBytes.subarray(
        8 + outputRaw.headerSize,
        8 + outputRaw.headerSize + sourceData.length,
      ),
    ).toEqual(sourceData);
    const outputHeader = rawAsarHeader(output);
    expect(
      (outputHeader as unknown as Record<string, unknown>).customRootMetadata,
    ).toEqual({
      retained: true,
    });
    expect(nodeAt(outputHeader, "untouched.txt")).toEqual(
      nodeAt(sourceHeader, "untouched.txt"),
    );
    expect(nodeAt(outputHeader, "missing.txt")).toEqual(
      nodeAt(sourceHeader, "missing.txt"),
    );
    expect(await readAsarEntry(output, "replace.txt")).toEqual(
      Buffer.from("replacement"),
    );
    const marker = JSON.parse(
      (await readAsarEntry(output, "paseo-zcode-patcher.json")).toString(),
    ) as Record<string, unknown>;
    expect(marker).toMatchObject({
      paseoVersion: "0.7.2",
      originalAsarSha256: testFixture.manifest.paseo.sourceAsarSha256,
      overlaySha256: testFixture.manifest.overlayHash,
      zcodeArtifact: "zcode-host-3.11.2",
      zcodeProtocol: "zcode-task-v1",
      patchFormat: "header-preserving-append-v1",
    });
    expect(marker).not.toHaveProperty("createdAt");
  });

  it("produces byte-for-byte deterministic output", async () => {
    const testFixture = await fixture();
    const first = path.join(testFixture.directory, "first.asar");
    const second = path.join(testFixture.directory, "second.asar");
    await patchAsar(
      testFixture.sourceAsar,
      first,
      testFixture.artifactDirectory,
      testFixture.manifest,
    );
    await patchAsar(
      testFixture.sourceAsar,
      second,
      testFixture.artifactDirectory,
      testFixture.manifest,
    );
    expect(await sha256File(first)).toBe(await sha256File(second));
  });

  it("rejects an unsupported source before creating output", async () => {
    const testFixture = await fixture();
    testFixture.manifest.paseo.sourceAsarSha256 = "f".repeat(64);
    const output = path.join(testFixture.directory, "must-not-exist.asar");
    await expect(
      patchAsar(
        testFixture.sourceAsar,
        output,
        testFixture.artifactDirectory,
        testFixture.manifest,
      ),
    ).rejects.toThrow(/unsupported source ASAR/u);
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
