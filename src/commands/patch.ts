import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { patchAsar, readAsarEntry } from "../asar-patcher.js";
import {
  restoreSymlinkTimestamps,
  verifyBundleCopy,
  verifyBundleXattrs,
} from "../bundle-verification.js";
import {
  ARTIFACT_ID,
  ASAR_RELATIVE_PATH,
  OUTPUT_APP_PATH,
  SOURCE_APP_PATH,
  TARGET_PASEO_VERSION,
  ZCODE_APP_PATH,
} from "../constants.js";
import { sha256Buffer, sha256File } from "../hashes.js";
import { loadManifest } from "../manifest.js";
import { findRunningRelatedProcesses } from "../process-check.js";
import {
  applyResourceOverlay,
  verifyResourceEntries,
} from "../resource-patcher.js";
import { captureCommand, runCommand } from "../system.js";
import {
  assertZCodeAvailable,
  discoverZCodeRuntime,
  runZCodeRuntimeSmoke,
  type ZCodeDiagnostic,
} from "../zcode-runtime.js";

const MINIMUM_HEADROOM = 128n * 1024n * 1024n;
const MINIMUM_NODE_VERSION = [22, 12, 0] as const;

export function assertMinimumNodeVersion(version: string): void {
  const actual = version
    .split(".")
    .slice(0, 3)
    .map((part) => Number(part));
  if (actual.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`invalid Node.js version '${version}'`);
  }
  for (const [index, expected] of MINIMUM_NODE_VERSION.entries()) {
    const value = actual[index] ?? 0;
    if (value > expected) return;
    if (value < expected)
      throw new Error("Node.js 22.12.0 or newer is required");
  }
}

function artifactDirectory(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = path.join(directory, "artifacts", ARTIFACT_ID);
    if (existsSync(path.join(candidate, "manifest.json"))) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`could not locate artifacts/${ARTIFACT_ID}`);
}

function assertFixedPaths(): void {
  if (
    SOURCE_APP_PATH !== "/Applications/Paseo.app" ||
    ZCODE_APP_PATH !== "/Applications/ZCode.app" ||
    OUTPUT_APP_PATH !== "/Applications/PaseoZCode.app" ||
    path.resolve(SOURCE_APP_PATH) !== SOURCE_APP_PATH ||
    path.resolve(ZCODE_APP_PATH) !== ZCODE_APP_PATH ||
    path.resolve(OUTPUT_APP_PATH) !== OUTPUT_APP_PATH
  ) {
    throw new Error("application path constants failed strict validation");
  }
}

async function assertRegularNonSymlink(
  target: string,
  label: string,
): Promise<void> {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
}

async function assertSourceBundle(manifestHash: string): Promise<string> {
  const bundleStat = await fs.lstat(SOURCE_APP_PATH);
  if (bundleStat.isSymbolicLink() || !bundleStat.isDirectory()) {
    throw new Error(`${SOURCE_APP_PATH} must be a real application directory`);
  }
  const asarPath = path.join(SOURCE_APP_PATH, ASAR_RELATIVE_PATH);
  await assertRegularNonSymlink(asarPath, "source app.asar");
  const version = (
    await captureCommand("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleShortVersionString",
      path.join(SOURCE_APP_PATH, "Contents/Info.plist"),
    ])
  ).trim();
  if (version !== TARGET_PASEO_VERSION) {
    throw new Error(`unsupported Paseo version '${version}'`);
  }
  const architectures = (
    await captureCommand("/usr/bin/lipo", [
      "-archs",
      path.join(SOURCE_APP_PATH, "Contents/MacOS/Paseo"),
    ])
  )
    .trim()
    .split(/\s+/u);
  if (!architectures.includes("arm64")) {
    throw new Error("Paseo application does not contain arm64");
  }
  const sourceHash = await sha256File(asarPath);
  if (sourceHash !== manifestHash) {
    throw new Error(`unsupported source ASAR SHA-256: ${sourceHash}`);
  }
  return sourceHash;
}

async function assertDiskSpace(
  sourceAsar: string,
  overlayBytes: bigint,
): Promise<void> {
  const asarSize = BigInt((await fs.stat(sourceAsar)).size);
  const required = asarSize * 2n + overlayBytes + MINIMUM_HEADROOM;
  const filesystem = await fs.statfs(path.dirname(OUTPUT_APP_PATH), {
    bigint: true,
  });
  const available = filesystem.bavail * filesystem.bsize;
  if (available < required) {
    throw new Error(
      `insufficient free space: need ${required} bytes, have ${available} bytes`,
    );
  }
}

export async function removeValidatedOutput(
  targetPath: string,
  expectedPath: string,
): Promise<void> {
  if (
    !path.isAbsolute(targetPath) ||
    path.normalize(targetPath) !== expectedPath
  ) {
    throw new Error(
      `refusing to remove unvalidated output path '${targetPath}'`,
    );
  }
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    await fs.unlink(targetPath);
  } else {
    await fs.rm(targetPath, { recursive: true });
  }
}

export async function removeExistingOutput(): Promise<void> {
  assertFixedPaths();
  await removeValidatedOutput(OUTPUT_APP_PATH, "/Applications/PaseoZCode.app");
}

function sameZCodeIdentity(
  first: ZCodeDiagnostic,
  second: ZCodeDiagnostic,
): boolean {
  return (
    first.available === second.available &&
    first.appVersion === second.appVersion &&
    first.cliVersion === second.cliVersion &&
    first.cliIntegrity === second.cliIntegrity &&
    first.hostIndexSha256 === second.hostIndexSha256 &&
    first.hostRpcModuleSha256 === second.hostRpcModuleSha256 &&
    first.runtimeSmoke === second.runtimeSmoke
  );
}

async function verifyZCodeIdentity(expected: ZCodeDiagnostic): Promise<void> {
  const current = await runZCodeRuntimeSmoke(await discoverZCodeRuntime());
  assertZCodeAvailable(current);
  if (!sameZCodeIdentity(expected, current)) {
    throw new Error("ZCode changed while the patch was being prepared");
  }
}

export async function patchCommand(): Promise<void> {
  assertFixedPaths();
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("this patch supports only macOS arm64");
  }
  assertMinimumNodeVersion(process.versions.node);

  const artifacts = artifactDirectory();
  const manifest = await loadManifest(artifacts);
  const sourceAsar = path.join(SOURCE_APP_PATH, ASAR_RELATIVE_PATH);
  const sourceResources = path.dirname(sourceAsar);
  const originalHash = await assertSourceBundle(
    manifest.paseo.sourceAsarSha256,
  );
  await verifyResourceEntries(
    sourceResources,
    manifest.resourceEntries,
    "original",
  );
  const zcodeDiagnostic = await runZCodeRuntimeSmoke(
    await discoverZCodeRuntime(),
  );
  assertZCodeAvailable(zcodeDiagnostic);
  const overlaySizes = await Promise.all(
    [...manifest.entries, ...manifest.resourceEntries].map(async (entry) =>
      BigInt(
        (await fs.stat(path.join(artifacts, "overlay", entry.source))).size,
      ),
    ),
  );
  await assertDiskSpace(
    sourceAsar,
    overlaySizes.reduce((total, size) => total + size, 0n),
  );

  const running = await findRunningRelatedProcesses();
  if (running.length > 0) {
    const details = running
      .map((entry) => `PID ${entry.pid}: Paseo/ZCode related process`)
      .join("\n");
    throw new Error(
      `Paseo and ZCode processes must be stopped before patching:\n${details}`,
    );
  }

  await assertSourceBundle(originalHash);
  await verifyResourceEntries(
    sourceResources,
    manifest.resourceEntries,
    "original",
  );
  await verifyZCodeIdentity(zcodeDiagnostic);
  await removeExistingOutput();
  const temporaryBundle = `/Applications/.PaseoZCode.app.${process.pid}.${randomUUID()}`;
  if (!temporaryBundle.startsWith("/Applications/.PaseoZCode.app.")) {
    throw new Error("temporary application path failed strict validation");
  }

  try {
    await runCommand("/usr/bin/ditto", [
      "--clone",
      SOURCE_APP_PATH,
      temporaryBundle,
    ]);
    const temporaryAsar = path.join(temporaryBundle, ASAR_RELATIVE_PATH);
    const temporaryResources = path.dirname(temporaryAsar);
    const sourceResourcesStat = await fs.stat(path.dirname(sourceAsar));
    if ((await sha256File(temporaryAsar)) !== originalHash) {
      throw new Error("cloned source ASAR does not match the original");
    }
    await patchAsar(temporaryAsar, temporaryAsar, artifacts, manifest);
    await applyResourceOverlay(
      temporaryResources,
      artifacts,
      manifest.resourceEntries,
    );
    for (const entry of manifest.entries) {
      const actual = sha256Buffer(
        await readAsarEntry(temporaryAsar, entry.path),
      );
      if (actual !== entry.sha256) {
        throw new Error(`patched entry verification failed: ${entry.path}`);
      }
    }
    await fs.utimes(
      path.dirname(temporaryAsar),
      sourceResourcesStat.atime,
      sourceResourcesStat.mtime,
    );
    await restoreSymlinkTimestamps(SOURCE_APP_PATH, temporaryBundle);
    await verifyBundleCopy(SOURCE_APP_PATH, temporaryBundle, [
      ASAR_RELATIVE_PATH,
      ...manifest.resourceEntries.map((entry) =>
        path.join("Contents/Resources", entry.path),
      ),
    ]);
    await verifyZCodeIdentity(zcodeDiagnostic);
    await runCommand("/usr/bin/codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--preserve-metadata=entitlements",
      temporaryBundle,
    ]);
    await runCommand("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      temporaryBundle,
    ]);
    await verifyBundleXattrs(SOURCE_APP_PATH, temporaryBundle, {
      ignoreRootMacl: true,
    });
    if (
      (await sha256File(temporaryAsar)) !== manifest.paseo.patchedAsarSha256
    ) {
      throw new Error("ad-hoc signing changed the patched ASAR");
    }
    await verifyResourceEntries(
      temporaryResources,
      manifest.resourceEntries,
      "patched",
    );
    await fs.rename(temporaryBundle, OUTPUT_APP_PATH);
    const installedHash = await sha256File(
      path.join(OUTPUT_APP_PATH, ASAR_RELATIVE_PATH),
    );
    if (installedHash !== manifest.paseo.patchedAsarSha256) {
      throw new Error(`installed ASAR verification failed: ${installedHash}`);
    }
    await verifyResourceEntries(
      path.join(OUTPUT_APP_PATH, "Contents/Resources"),
      manifest.resourceEntries,
      "patched",
    );
    await runCommand("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      OUTPUT_APP_PATH,
    ]);
    if ((await sha256File(sourceAsar)) !== originalHash) {
      throw new Error("the original Paseo ASAR changed unexpectedly");
    }
    await verifyResourceEntries(
      sourceResources,
      manifest.resourceEntries,
      "original",
    );
    await verifyZCodeIdentity(zcodeDiagnostic);
  } catch (error) {
    await fs.rm(temporaryBundle, { recursive: true, force: true });
    await removeExistingOutput();
    const currentOriginalHash = await sha256File(sourceAsar);
    if (currentOriginalHash !== originalHash) {
      throw new AggregateError(
        [error],
        `patch failed and the original Paseo ASAR changed unexpectedly: ${currentOriginalHash}`,
      );
    }
    await verifyResourceEntries(
      sourceResources,
      manifest.resourceEntries,
      "original",
    );
    throw error;
  }

  console.log(`Created ${OUTPUT_APP_PATH}`);
  console.log("Signing: ad-hoc (original entitlements preserved)");
  console.log(
    `ZCode: ${zcodeDiagnostic.appVersion} / ${zcodeDiagnostic.hostArtifact} / ${zcodeDiagnostic.hostProtocol}`,
  );
  if (zcodeDiagnostic.cliIntegrity === "modified") {
    console.warn(
      "Warning: ZCode CLI content differs from the verified artifact",
    );
  }
}
