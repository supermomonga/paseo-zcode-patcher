import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { patchAsar, readAsarEntry } from "../src/asar-patcher.js";
import {
  ARTIFACT_ID,
  PATCH_FORMAT,
  PASEO_SOURCE_ARCHIVE,
  TARGET_PASEO_COMMIT,
  TARGET_PASEO_RENDERER_RESOURCE,
  TARGET_PASEO_RENDERER_SHA256,
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
import {
  computePatchOverlayHash,
  sha256Buffer,
  sha256File,
} from "../src/hashes.js";
import type { OverlayEntry, PatchManifest } from "../src/manifest.js";

import { downloadSourceArchive } from "./source-archive.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const fixedOverlaySources = [
  {
    source: "packages/protocol/dist/generated/validation/ws-outbound.aot.js",
    target:
      "node_modules/@getpaseo/protocol/dist/generated/validation/ws-outbound.aot.js",
  },
  {
    source: "packages/protocol/dist/messages.js",
    target: "node_modules/@getpaseo/protocol/dist/messages.js",
  },
  {
    source: "packages/client/dist/daemon-client.js",
    target: "node_modules/@getpaseo/client/dist/daemon-client.js",
  },
  {
    source: "packages/server/dist/server/server/agent/agent-manager.js",
    target:
      "node_modules/@getpaseo/server/dist/server/server/agent/agent-manager.js",
  },
  {
    source: "packages/server/dist/server/server/session.js",
    target: "node_modules/@getpaseo/server/dist/server/server/session.js",
  },
  {
    source:
      "packages/server/dist/server/server/session/provider/provider-catalog-session.js",
    target:
      "node_modules/@getpaseo/server/dist/server/server/session/provider/provider-catalog-session.js",
  },
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

async function regularFiles(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        result.set(
          path.relative(root, absolute).split(path.sep).join("/"),
          await sha256File(absolute),
        );
      }
    }
  }
  await visit(root);
  return result;
}

async function builtRendererBundle(
  buildRoot: string,
  sourceResources: string,
): Promise<string> {
  const builtApp = path.join(buildRoot, "packages/app/dist");
  const sourceApp = path.join(sourceResources, "app-dist");
  const builtFiles = await regularFiles(builtApp);
  const sourceFiles = await regularFiles(sourceApp);
  const bundlePattern = /^_expo\/static\/js\/web\/index-[0-9a-f]{32}\.js$/u;
  const builtBundles = [...builtFiles.keys()].filter((file) =>
    bundlePattern.test(file),
  );
  const sourceBundles = [...sourceFiles.keys()].filter((file) =>
    bundlePattern.test(file),
  );
  if (builtBundles.length !== 1 || sourceBundles.length !== 1) {
    throw new Error(
      "expected exactly one built and one source renderer bundle",
    );
  }
  const builtBundle = builtBundles[0]!;
  const sourceBundle = sourceBundles[0]!;
  if (
    sourceBundle !== TARGET_PASEO_RENDERER_RESOURCE.slice("app-dist/".length)
  ) {
    throw new Error(
      "source renderer bundle path does not match the fixed artifact",
    );
  }
  if (sourceFiles.get(sourceBundle) !== TARGET_PASEO_RENDERER_SHA256) {
    throw new Error(
      "source renderer bundle hash does not match the fixed artifact",
    );
  }
  for (const file of ["index.html", builtBundle]) builtFiles.delete(file);
  for (const file of ["index.html", sourceBundle]) sourceFiles.delete(file);
  const sortedBuiltFiles = [...builtFiles].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const sortedSourceFiles = [...sourceFiles].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(sortedBuiltFiles) !== JSON.stringify(sortedSourceFiles)) {
    throw new Error("renderer build changed files outside the main bundle");
  }
  return path.join(builtApp, builtBundle);
}

async function copyResourceOverlayFile(
  source: string,
  target: string,
  overlayDirectory: string,
  sourceResources: string,
): Promise<OverlayEntry> {
  const artifactSource = `resources/${target}`;
  const destination = path.join(overlayDirectory, artifactSource);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  const contents = await fs.readFile(destination);
  const originalSha256 = await sha256File(path.join(sourceResources, target));
  return {
    path: target,
    source: artifactSource,
    sha256: sha256Buffer(contents),
    originalSha256,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "source-asar": {
        type: "string",
        default: "/Applications/Paseo.app/Contents/Resources/app.asar",
      },
    },
    allowPositionals: false,
  });
  const sourceAsar = path.resolve(values["source-asar"]);
  const expectedManifest: PatchManifest = JSON.parse(
    await fs.readFile(
      path.join(repositoryRoot, "manifests", `${ARTIFACT_ID}.json`),
      "utf8",
    ),
  );
  const sourceResources = path.dirname(sourceAsar);
  if (
    (await sha256File(sourceAsar)) !== expectedManifest.paseo.sourceAsarSha256
  ) {
    throw new Error(
      "source ASAR does not match the supported Paseo 0.7.2 arm64 artifact",
    );
  }

  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "paseo-zcode-overlay-"),
  );
  try {
    console.log(`Downloading verified Paseo source ${TARGET_PASEO_COMMIT}`);
    await downloadSourceArchive(PASEO_SOURCE_ARCHIVE, temporaryRoot);
    await run(
      "git",
      [
        "apply",
        "--unidiff-zero",
        "--whitespace=error-all",
        path.join(repositoryRoot, "patches/paseo-v0.7.2-zcode.patch"),
      ],
      temporaryRoot,
    );
    await run("npm", ["ci", "--ignore-scripts"], temporaryRoot);
    await run("npm", ["run", "postinstall"], temporaryRoot);
    await run("npm", ["run", "build:server-deps"], temporaryRoot);
    await run(
      "npm",
      ["run", "build", "--workspace=@getpaseo/expo-two-way-audio"],
      temporaryRoot,
    );
    await run(
      "npx",
      [
        "vitest",
        "run",
        "packages/server/src/server/agent/provider-registry.test.ts",
        "packages/server/src/server/agent/provider-registry-wrap.test.ts",
        "packages/server/src/server/agent/providers/zcode",
        "packages/server/src/server/session/provider/provider-catalog-session.test.ts",
        "packages/client/src/daemon-client.test.ts",
        "packages/app/src/components/provider-icon-name.test.ts",
        "packages/app/src/provider-usage/format.test.ts",
        "packages/app/src/provider-selection/resolve-agent-form.test.ts",
        "packages/app/src/screens/workspace/workspace-draft-agent-config.test.ts",
        "packages/app/src/composer/draft/workspace-tab.test.ts",
      ],
      temporaryRoot,
    );
    await run(
      "npm",
      [
        "run",
        "test",
        "--workspace=@getpaseo/app",
        "--",
        "--project",
        "unit",
        "src/stores/workspace-layout-store.test.ts",
        "src/provider-usage/use-provider-usage.test.tsx",
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
      ["run", "typecheck", "--workspace=@getpaseo/client"],
      temporaryRoot,
    );
    await run(
      "npm",
      ["run", "typecheck", "--workspace=@getpaseo/app"],
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
    await run(
      "npx",
      [
        "cross-env",
        "PASEO_WEB_PLATFORM=electron",
        "npx",
        "expo",
        "export",
        "--platform",
        "web",
      ],
      path.join(temporaryRoot, "packages/app"),
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
    const generatedDirectory = path.join(temporaryRoot, "generated-artifact");
    const overlayDirectory = path.join(generatedDirectory, "overlay");
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
    const resourceEntries = [
      await copyResourceOverlayFile(
        await builtRendererBundle(temporaryRoot, sourceResources),
        TARGET_PASEO_RENDERER_RESOURCE,
        overlayDirectory,
        sourceResources,
      ),
    ];
    const overlayHash = computePatchOverlayHash(entries, resourceEntries);
    const manifest: PatchManifest = {
      artifactId: ARTIFACT_ID,
      paseo: {
        version: TARGET_PASEO_VERSION,
        commit: TARGET_PASEO_COMMIT,
        platform: "darwin",
        arch: "arm64",
        sourceAsarSha256: expectedManifest.paseo.sourceAsarSha256,
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
      resourceEntries,
    };
    const first = path.join(temporaryRoot, "patched-first.asar");
    const second = path.join(temporaryRoot, "patched-second.asar");
    const firstHash = await patchAsar(
      sourceAsar,
      first,
      generatedDirectory,
      manifest,
    );
    const secondHash = await patchAsar(
      sourceAsar,
      second,
      generatedDirectory,
      manifest,
    );
    if (firstHash !== secondHash) {
      throw new Error("overlay generation is not byte-for-byte deterministic");
    }
    manifest.paseo.patchedAsarSha256 = firstHash;
    assert.deepStrictEqual(
      manifest,
      expectedManifest,
      "Generated overlay does not match the verified manifest",
    );
    await fs.writeFile(
      path.join(generatedDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await fs.rm(artifactDirectory, { recursive: true, force: true });
    await fs.mkdir(path.dirname(artifactDirectory), { recursive: true });
    await fs.cp(generatedDirectory, artifactDirectory, { recursive: true });
    console.log(`Generated and verified ${artifactDirectory}`);
    console.log(`Overlay SHA-256: ${overlayHash}`);
    console.log(`Patched ASAR SHA-256: ${firstHash}`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
