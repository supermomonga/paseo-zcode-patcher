import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { patchAsar, readAsarEntry } from "../src/asar-patcher.js";
import {
  ARTIFACT_ID,
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
} from "../src/constants.js";
import { computeOverlayHash, sha256Buffer, sha256File } from "../src/hashes.js";
import type { OverlayEntry, PatchManifest } from "../src/manifest.js";

const EXPECTED_SOURCE_ASAR =
  "67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b";
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const fixedOverlaySources = [
  {
    source: "packages/protocol/dist/provider-config.js",
    target: "node_modules/@getpaseo/protocol/dist/provider-config.js",
  },
  {
    source: "packages/protocol/dist/provider-manifest.js",
    target: "node_modules/@getpaseo/protocol/dist/provider-manifest.js",
  },
  {
    source: "packages/server/dist/server/server/agent/provider-registry.js",
    target:
      "node_modules/@getpaseo/server/dist/server/server/agent/provider-registry.js",
  },
] as const;

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return path.resolve(value);
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null)
        reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0)
        reject(new Error(`${command} exited with ${String(code)}`));
      else resolve();
    });
  });
}

async function capture(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null)
        reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0)
        reject(new Error(`${command} exited with ${String(code)}`));
      else resolve(stdout);
    });
  });
}

async function assertFixedCleanCheckout(checkout: string): Promise<void> {
  const head = (await capture("git", ["rev-parse", "HEAD"], checkout)).trim();
  if (head !== TARGET_PASEO_COMMIT) {
    throw new Error(`Paseo checkout HEAD must be ${TARGET_PASEO_COMMIT}`);
  }
  if (
    (await capture("git", ["status", "--porcelain=v1"], checkout)).trim() !== ""
  ) {
    throw new Error("Paseo checkout must be clean");
  }
}

async function archiveCheckout(
  checkout: string,
  destination: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const archive = spawn("git", ["archive", "HEAD"], {
      cwd: checkout,
      stdio: ["ignore", "pipe", "inherit"],
    });
    const extract = spawn("tar", ["-x", "-C", destination], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    archive.stdout.pipe(extract.stdin);
    let archiveCode: number | null = null;
    let extractCode: number | null = null;
    const finish = (): void => {
      if (archiveCode === null || extractCode === null) return;
      if (archiveCode === 0 && extractCode === 0) resolve();
      else
        reject(
          new Error(`git archive/tar failed (${archiveCode}/${extractCode})`),
        );
    };
    archive.once("error", reject);
    extract.once("error", reject);
    archive.once("exit", (code) => {
      archiveCode = code;
      finish();
    });
    extract.once("exit", (code) => {
      extractCode = code;
      finish();
    });
  });
}

async function providerRuntimeSources(
  buildRoot: string,
): Promise<Array<{ source: string; target: string }>> {
  const providerRoot = path.join(
    buildRoot,
    "packages/server/dist/server/server/agent/providers/zcode",
  );
  const result: Array<{ source: string; target: string }> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        const relative = path
          .relative(providerRoot, absolute)
          .split(path.sep)
          .join("/");
        result.push({
          source: path.relative(buildRoot, absolute),
          target: `node_modules/@getpaseo/server/dist/server/server/agent/providers/zcode/${relative}`,
        });
      }
    }
  }
  await visit(providerRoot);
  return result.sort((left, right) => left.target.localeCompare(right.target));
}

async function copyOverlayFile(
  source: string,
  target: string,
  overlayDirectory: string,
  sourceAsar: string,
): Promise<OverlayEntry> {
  if (target.includes("renderer") || target.includes("/ui/")) {
    throw new Error(`renderer output is forbidden in the overlay: ${target}`);
  }
  const destination = path.join(overlayDirectory, target);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  const contents = await fs.readFile(destination);
  let originalSha256: string | null = null;
  try {
    originalSha256 = sha256Buffer(await readAsarEntry(sourceAsar, target));
  } catch (error) {
    if (!String(error).includes("is missing")) throw error;
  }
  return {
    path: target,
    source: target,
    sha256: sha256Buffer(contents),
    originalSha256,
  };
}

async function main(): Promise<void> {
  const checkout = option("--paseo-source");
  const sourceAsar = option(
    "--source-asar",
    "/Applications/Paseo.app/Contents/Resources/app.asar",
  );
  await assertFixedCleanCheckout(checkout);
  if ((await sha256File(sourceAsar)) !== EXPECTED_SOURCE_ASAR) {
    throw new Error(
      "source ASAR does not match the supported Paseo 0.7.2 arm64 artifact",
    );
  }

  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "paseo-zcode-overlay-"),
  );
  try {
    await archiveCheckout(checkout, temporaryRoot);
    await run(
      "git",
      [
        "apply",
        "--whitespace=error-all",
        path.join(repositoryRoot, "patches/paseo-v0.7.2-zcode.patch"),
      ],
      temporaryRoot,
    );
    await run("npm", ["ci", "--ignore-scripts"], temporaryRoot);
    await run("npm", ["run", "build:server-deps"], temporaryRoot);
    await run(
      "npx",
      [
        "vitest",
        "run",
        "packages/server/src/server/agent/provider-registry.test.ts",
        "packages/server/src/server/agent/provider-registry-wrap.test.ts",
        "packages/server/src/server/agent/providers/zcode",
      ],
      temporaryRoot,
    );
    await run(
      "npm",
      ["run", "typecheck", "--workspace=@getpaseo/protocol"],
      temporaryRoot,
    );
    await run(
      "npm",
      ["run", "typecheck", "--workspace=@getpaseo/server"],
      temporaryRoot,
    );
    await run(
      "npm",
      ["run", "build", "--workspace=@getpaseo/protocol"],
      temporaryRoot,
    );
    await run(
      "npm",
      ["run", "build", "--workspace=@getpaseo/server"],
      temporaryRoot,
    );

    const providerEntry = path.join(
      temporaryRoot,
      "packages/server/dist/server/server/agent/providers/zcode/agent.js",
    );
    await import(pathToFileURL(providerEntry).href);

    const artifactDirectory = path.join(
      repositoryRoot,
      "artifacts",
      ARTIFACT_ID,
    );
    const artifactsRoot = path.join(repositoryRoot, "artifacts") + path.sep;
    if (!artifactDirectory.startsWith(artifactsRoot)) {
      throw new Error("artifact path failed strict validation");
    }
    await fs.rm(artifactDirectory, { recursive: true, force: true });
    const overlayDirectory = path.join(artifactDirectory, "overlay");
    await fs.mkdir(overlayDirectory, { recursive: true });
    const sources = [
      ...fixedOverlaySources,
      ...(await providerRuntimeSources(temporaryRoot)),
    ].sort((left, right) => left.target.localeCompare(right.target));
    const entries: OverlayEntry[] = [];
    for (const entry of sources) {
      entries.push(
        await copyOverlayFile(
          path.join(temporaryRoot, entry.source),
          entry.target,
          overlayDirectory,
          sourceAsar,
        ),
      );
    }
    const overlayHash = computeOverlayHash(entries);
    const manifest: PatchManifest = {
      artifactId: ARTIFACT_ID,
      paseo: {
        version: TARGET_PASEO_VERSION,
        commit: TARGET_PASEO_COMMIT,
        platform: "darwin",
        arch: "arm64",
        sourceAsarSha256: EXPECTED_SOURCE_ASAR,
        patchedAsarSha256: "",
      },
      zcode: {
        appVersion: TARGET_ZCODE_APP_VERSION,
        cliVersion: TARGET_ZCODE_CLI_VERSION,
        cliSha256: TARGET_ZCODE_CLI_SHA256,
        artifact: TARGET_ZCODE_HOST_ARTIFACT,
        protocol: TARGET_ZCODE_HOST_PROTOCOL,
        hostIndexSha256: TARGET_ZCODE_HOST_INDEX_SHA256,
        hostRpcModuleSha256: TARGET_ZCODE_RPC_SHA256,
        requiredExports: [...TARGET_ZCODE_RPC_EXPORTS],
        referenceCommit: ZCODE_REFERENCE_COMMIT,
      },
      patchFormat: PATCH_FORMAT,
      markerPath: "paseo-zcode-patcher.json",
      overlayHash,
      entries,
    };
    const first = path.join(temporaryRoot, "patched-first.asar");
    const second = path.join(temporaryRoot, "patched-second.asar");
    const firstHash = await patchAsar(
      sourceAsar,
      first,
      artifactDirectory,
      manifest,
    );
    const secondHash = await patchAsar(
      sourceAsar,
      second,
      artifactDirectory,
      manifest,
    );
    if (firstHash !== secondHash) {
      throw new Error("overlay generation is not byte-for-byte deterministic");
    }
    manifest.paseo.patchedAsarSha256 = firstHash;
    await fs.writeFile(
      path.join(artifactDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    console.log(`Generated ${artifactDirectory}`);
    console.log(`Overlay SHA-256: ${overlayHash}`);
    console.log(`Patched ASAR SHA-256: ${firstHash}`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
