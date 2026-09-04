import { getRawHeader } from "@electron/asar";
import fs from "node:fs/promises";
import path from "node:path";

import { MARKER_PATH } from "./constants.js";
import { sha256Buffer, sha256File } from "./hashes.js";
import { markerContents, type PatchManifest } from "./manifest.js";

const BLOCK_SIZE = 4 * 1024 * 1024;

export interface AsarDirectory {
  files: Record<string, AsarNode>;
  unpacked?: boolean;
  [key: string]: unknown;
}

interface AsarFile {
  size: number;
  offset?: string;
  unpacked?: boolean;
  integrity?: unknown;
  executable?: boolean;
  [key: string]: unknown;
}

type AsarNode = AsarDirectory | AsarFile;

interface PreparedEntry {
  path: string;
  contents: Buffer;
  originalSha256: string | null;
}

function isDirectory(node: AsarNode): node is AsarDirectory {
  return "files" in node;
}

function encodePicklePayload(payload: Buffer): Buffer {
  const paddedLength = Math.ceil(payload.length / 4) * 4;
  const result = Buffer.alloc(4 + paddedLength);
  result.writeUInt32LE(paddedLength, 0);
  payload.copy(result, 4);
  return result;
}

export function encodeAsarHeader(header: AsarDirectory): Buffer {
  const json = Buffer.from(JSON.stringify(header));
  const stringPayload = Buffer.alloc(4 + json.length);
  stringPayload.writeInt32LE(json.length, 0);
  json.copy(stringPayload, 4);
  const headerPickle = encodePicklePayload(stringPayload);
  const sizePayload = Buffer.alloc(4);
  sizePayload.writeUInt32LE(headerPickle.length, 0);
  return Buffer.concat([encodePicklePayload(sizePayload), headerPickle]);
}

function getNode(root: AsarDirectory, entryPath: string): AsarNode | undefined {
  let current: AsarNode = root;
  for (const part of entryPath.split("/")) {
    if (!isDirectory(current)) return undefined;
    const next: AsarNode | undefined = current.files[part];
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function setFileNode(
  root: AsarDirectory,
  entryPath: string,
  file: AsarFile,
): void {
  const parts = entryPath.split("/");
  const name = parts.pop();
  if (!name) throw new Error(`invalid ASAR entry path '${entryPath}'`);
  let current = root;
  for (const part of parts) {
    const existing = current.files[part];
    if (existing && !isDirectory(existing)) {
      throw new Error(`ASAR entry '${entryPath}' traverses a file`);
    }
    if (!existing) current.files[part] = { files: {} };
    current = current.files[part] as AsarDirectory;
  }
  current.files[name] = file;
}

function integrity(contents: Buffer) {
  const blocks: string[] = [];
  if (contents.length === 0) {
    blocks.push(sha256Buffer(Buffer.alloc(0)));
  } else {
    for (let offset = 0; offset < contents.length; offset += BLOCK_SIZE) {
      blocks.push(sha256Buffer(contents.subarray(offset, offset + BLOCK_SIZE)));
    }
  }
  return {
    algorithm: "SHA256",
    hash: sha256Buffer(contents),
    blockSize: BLOCK_SIZE,
    blocks,
  };
}

async function readPackedEntry(
  fileHandle: fs.FileHandle,
  dataStart: number,
  node: AsarFile,
  entryPath: string,
): Promise<Buffer> {
  if (
    node.unpacked ||
    node.offset === undefined ||
    !Number.isSafeInteger(node.size)
  ) {
    throw new Error(`ASAR entry '${entryPath}' is not a supported packed file`);
  }
  const offset = Number(node.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || node.size < 0) {
    throw new Error(`ASAR entry '${entryPath}' has an invalid offset or size`);
  }
  const contents = Buffer.alloc(node.size);
  const { bytesRead } = await fileHandle.read(
    contents,
    0,
    node.size,
    dataStart + offset,
  );
  if (bytesRead !== node.size)
    throw new Error(`could not read ASAR entry '${entryPath}'`);
  return contents;
}

async function copyRange(
  source: fs.FileHandle,
  destination: fs.FileHandle,
  sourceStart: number,
  length: number,
  destinationStart: number,
): Promise<void> {
  const buffer = Buffer.alloc(1024 * 1024);
  let copied = 0;
  while (copied < length) {
    const chunkLength = Math.min(buffer.length, length - copied);
    const { bytesRead } = await source.read(
      buffer,
      0,
      chunkLength,
      sourceStart + copied,
    );
    if (bytesRead === 0) throw new Error("unexpected end of ASAR data region");
    await writeAll(
      destination,
      buffer.subarray(0, bytesRead),
      destinationStart + copied,
    );
    copied += bytesRead;
  }
}

async function writeAll(
  handle: fs.FileHandle,
  buffer: Buffer,
  position: number,
): Promise<void> {
  let written = 0;
  while (written < buffer.length) {
    const result = await handle.write(
      buffer,
      written,
      buffer.length - written,
      position + written,
    );
    if (result.bytesWritten === 0)
      throw new Error("could not write patched ASAR");
    written += result.bytesWritten;
  }
}

export async function patchAsar(
  sourceAsar: string,
  destinationAsar: string,
  artifactDirectory: string,
  manifest: PatchManifest,
): Promise<string> {
  const sourceHash = await sha256File(sourceAsar);
  if (sourceHash !== manifest.paseo.sourceAsarSha256) {
    throw new Error(`unsupported source ASAR SHA-256: ${sourceHash}`);
  }

  const raw = getRawHeader(sourceAsar);
  const header = JSON.parse(raw.headerString) as AsarDirectory;
  if (!header.files || typeof header.files !== "object")
    throw new Error("invalid ASAR header");
  const sourceStat = await fs.stat(sourceAsar);
  const dataStart = 8 + raw.headerSize;
  const originalDataLength = sourceStat.size - dataStart;
  if (originalDataLength < 0) throw new Error("invalid ASAR data region");

  const sourceHandle = await fs.open(sourceAsar, "r");
  const prepared: PreparedEntry[] = [];
  try {
    for (const entry of manifest.entries) {
      const contents = await fs.readFile(
        path.join(artifactDirectory, "overlay", entry.source),
      );
      if (sha256Buffer(contents) !== entry.sha256) {
        throw new Error(`overlay hash mismatch for '${entry.path}'`);
      }
      const existing = getNode(header, entry.path);
      if (entry.originalSha256 === null) {
        if (existing)
          throw new Error(`ASAR entry '${entry.path}' unexpectedly exists`);
      } else {
        if (!existing || isDirectory(existing)) {
          throw new Error(`required ASAR entry '${entry.path}' is missing`);
        }
        const existingContents = await readPackedEntry(
          sourceHandle,
          dataStart,
          existing,
          entry.path,
        );
        const actualHash = sha256Buffer(existingContents);
        if (actualHash !== entry.originalSha256) {
          throw new Error(`original entry hash mismatch for '${entry.path}'`);
        }
      }
      prepared.push({
        path: entry.path,
        contents,
        originalSha256: entry.originalSha256,
      });
    }

    const marker = markerContents(manifest);
    if (getNode(header, MARKER_PATH))
      throw new Error(`ASAR marker '${MARKER_PATH}' already exists`);
    prepared.push({
      path: MARKER_PATH,
      contents: marker,
      originalSha256: null,
    });

    let appendOffset = originalDataLength;
    for (const entry of prepared) {
      const existing = getNode(header, entry.path);
      const replacement: AsarFile =
        existing && !isDirectory(existing) ? { ...existing } : { size: 0 };
      replacement.offset = String(appendOffset);
      replacement.size = entry.contents.length;
      replacement.integrity = integrity(entry.contents);
      delete replacement.unpacked;
      setFileNode(header, entry.path, replacement);
      appendOffset += entry.contents.length;
    }

    const encodedHeader = encodeAsarHeader(header);
    const destinationDirectory = path.dirname(destinationAsar);
    await fs.mkdir(destinationDirectory, { recursive: true });
    const temporaryPath = path.join(
      destinationDirectory,
      `.${path.basename(destinationAsar)}.${process.pid}.tmp`,
    );
    const destinationHandle = await fs.open(
      temporaryPath,
      "wx",
      sourceStat.mode,
    );
    try {
      await writeAll(destinationHandle, encodedHeader, 0);
      await copyRange(
        sourceHandle,
        destinationHandle,
        dataStart,
        originalDataLength,
        encodedHeader.length,
      );
      let position = encodedHeader.length + originalDataLength;
      for (const entry of prepared) {
        await writeAll(destinationHandle, entry.contents, position);
        position += entry.contents.length;
      }
      await destinationHandle.sync();
    } catch (error) {
      await destinationHandle.close();
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    await destinationHandle.close();
    await fs.rename(temporaryPath, destinationAsar);
  } finally {
    await sourceHandle.close();
  }

  const resultHash = await sha256File(destinationAsar);
  if (
    manifest.paseo.patchedAsarSha256 &&
    resultHash !== manifest.paseo.patchedAsarSha256
  ) {
    throw new Error(`patched ASAR SHA-256 mismatch: ${resultHash}`);
  }
  return resultHash;
}

export async function readAsarEntry(
  asarPath: string,
  entryPath: string,
): Promise<Buffer> {
  const raw = getRawHeader(asarPath);
  const header = raw.header as AsarDirectory;
  const node = getNode(header, entryPath);
  if (!node || isDirectory(node))
    throw new Error(`ASAR entry '${entryPath}' is missing`);
  const handle = await fs.open(asarPath, "r");
  try {
    return await readPackedEntry(handle, 8 + raw.headerSize, node, entryPath);
  } finally {
    await handle.close();
  }
}

export function rawAsarHeader(asarPath: string): AsarDirectory {
  return getRawHeader(asarPath).header as AsarDirectory;
}
