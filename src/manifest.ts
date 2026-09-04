import fs from "node:fs/promises";
import path from "node:path";

import {
  ARTIFACT_ID,
  MARKER_PATH,
  PATCHER_VERSION,
  PATCH_FORMAT,
  TARGET_PASEO_COMMIT,
  TARGET_PASEO_VERSION,
  TARGET_ZCODE_APP_VERSION,
  TARGET_ZCODE_CLI_SHA256,
  TARGET_ZCODE_CLI_VERSION,
  TARGET_ZCODE_HOST_ARTIFACT,
  TARGET_ZCODE_HOST_INDEX_SHA256,
  TARGET_ZCODE_HOST_PROTOCOL,
  TARGET_ZCODE_RPC_EXPORTS,
  TARGET_ZCODE_RPC_SHA256,
  ZCODE_REFERENCE_COMMIT,
} from "./constants.js";
import { computeOverlayHash, sha256File } from "./hashes.js";

export interface OverlayEntry {
  path: string;
  source: string;
  sha256: string;
  originalSha256: string | null;
}

export interface PatchManifest {
  artifactId: string;
  paseo: {
    version: string;
    commit: string;
    platform: "darwin";
    arch: "arm64";
    sourceAsarSha256: string;
    patchedAsarSha256: string;
  };
  zcode: {
    appVersion: string;
    cliVersion: string;
    cliSha256: string;
    artifact: string;
    protocol: string;
    hostIndexSha256: string;
    hostRpcModuleSha256: string;
    requiredExports: string[];
    referenceCommit: string;
  };
  patchFormat: string;
  markerPath: string;
  overlayHash: string;
  entries: OverlayEntry[];
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export async function loadManifest(
  artifactDirectory: string,
): Promise<PatchManifest> {
  const parsed: unknown = JSON.parse(
    await fs.readFile(path.join(artifactDirectory, "manifest.json"), "utf8"),
  );
  assertRecord(parsed, "manifest");
  assertRecord(parsed.paseo, "manifest.paseo");
  assertRecord(parsed.zcode, "manifest.zcode");
  if (
    parsed.artifactId !== ARTIFACT_ID ||
    parsed.paseo.version !== TARGET_PASEO_VERSION ||
    parsed.paseo.commit !== TARGET_PASEO_COMMIT ||
    parsed.paseo.platform !== "darwin" ||
    parsed.paseo.arch !== "arm64" ||
    !isSha256(parsed.paseo.sourceAsarSha256) ||
    !isSha256(parsed.paseo.patchedAsarSha256) ||
    parsed.zcode.appVersion !== TARGET_ZCODE_APP_VERSION ||
    parsed.zcode.cliVersion !== TARGET_ZCODE_CLI_VERSION ||
    parsed.zcode.cliSha256 !== TARGET_ZCODE_CLI_SHA256 ||
    parsed.zcode.artifact !== TARGET_ZCODE_HOST_ARTIFACT ||
    parsed.zcode.protocol !== TARGET_ZCODE_HOST_PROTOCOL ||
    parsed.zcode.hostIndexSha256 !== TARGET_ZCODE_HOST_INDEX_SHA256 ||
    parsed.zcode.hostRpcModuleSha256 !== TARGET_ZCODE_RPC_SHA256 ||
    JSON.stringify(parsed.zcode.requiredExports) !==
      JSON.stringify(TARGET_ZCODE_RPC_EXPORTS) ||
    parsed.zcode.referenceCommit !== ZCODE_REFERENCE_COMMIT ||
    parsed.patchFormat !== PATCH_FORMAT ||
    parsed.markerPath !== MARKER_PATH ||
    !isSha256(parsed.overlayHash) ||
    !Array.isArray(parsed.entries)
  ) {
    throw new Error("unsupported or malformed patch manifest");
  }

  const entries: OverlayEntry[] = parsed.entries.map((entry, index) => {
    assertRecord(entry, `manifest.entries[${index}]`);
    if (
      typeof entry.path !== "string" ||
      entry.path.startsWith("/") ||
      entry.path
        .split("/")
        .some((part) => part === "" || part === "." || part === "..") ||
      typeof entry.source !== "string" ||
      path.isAbsolute(entry.source) ||
      entry.source
        .split(/[\\/]/u)
        .some((part) => part === "" || part === "." || part === "..") ||
      !isSha256(entry.sha256) ||
      (entry.originalSha256 !== null && !isSha256(entry.originalSha256))
    ) {
      throw new Error(`manifest.entries[${index}] is malformed`);
    }
    return entry as unknown as OverlayEntry;
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new Error("manifest contains duplicate ASAR entry paths");
  }
  for (const entry of entries) {
    const actual = await sha256File(
      path.join(artifactDirectory, "overlay", entry.source),
    );
    if (actual !== entry.sha256)
      throw new Error(`overlay hash mismatch for '${entry.path}'`);
  }
  if (computeOverlayHash(entries) !== parsed.overlayHash) {
    throw new Error("overlay aggregate hash mismatch");
  }
  return { ...(parsed as unknown as PatchManifest), entries };
}

export function markerContents(manifest: PatchManifest): Buffer {
  return Buffer.from(
    `${JSON.stringify(
      {
        patcherVersion: PATCHER_VERSION,
        paseoVersion: manifest.paseo.version,
        paseoSourceCommit: manifest.paseo.commit,
        originalAsarSha256: manifest.paseo.sourceAsarSha256,
        overlaySha256: manifest.overlayHash,
        zcodeArtifact: manifest.zcode.artifact,
        zcodeProtocol: manifest.zcode.protocol,
        zcodeAcpReferenceCommit: manifest.zcode.referenceCommit,
        patchFormat: manifest.patchFormat,
      },
      null,
      2,
    )}\n`,
  );
}
