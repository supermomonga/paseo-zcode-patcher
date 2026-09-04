import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import {
  TARGET_ZCODE_APP_VERSION,
  TARGET_ZCODE_CLI_SHA256,
  TARGET_ZCODE_CLI_VERSION,
  TARGET_ZCODE_HOST_ARTIFACT,
  TARGET_ZCODE_HOST_INDEX,
  TARGET_ZCODE_HOST_INDEX_SHA256,
  TARGET_ZCODE_HOST_PROTOCOL,
  TARGET_ZCODE_RPC_EXPORTS,
  TARGET_ZCODE_RPC_MODULE,
  TARGET_ZCODE_RPC_SHA256,
  ZCODE_APP_PATH,
} from "./constants.js";
import { sha256File } from "./hashes.js";

const MetadataSchema = z
  .object({
    runtime: z.literal("electron-node"),
    entry: z.literal("zcode.cjs"),
    source: z.literal("apps/zcode-cli/packages/cli/dist/zcode.cjs"),
    platform: z.literal("darwin-arm64"),
  })
  .strict();

const HostInspectionSchema = z
  .object({
    hostIndexSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    hostRpcModuleSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    exports: z.array(z.string()),
  })
  .strict();

export interface CommandResult {
  exitCode: number;
  stdout: string;
}

export interface RuntimeCommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: {
      cwd: string;
      environment: NodeJS.ProcessEnv;
      timeoutMs: number;
    },
  ): Promise<CommandResult>;
  plist(path: string, key: string): Promise<string>;
}

const defaultRunner: RuntimeCommandRunner = {
  async run(command, args, options) {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let timedOut = false;
      let settled = false;
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      }, options.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length < 1024 * 1024) stdout += chunk;
      });
      child.stderr.resume();
      child.once("error", fail);
      child.once("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (timedOut) {
          reject(
            new Error(
              `ZCode runtime command timed out after ${options.timeoutMs}ms`,
            ),
          );
          return;
        }
        if (signal !== null) {
          reject(new Error(`ZCode runtime terminated by ${signal}`));
          return;
        }
        resolve({ exitCode: code ?? -1, stdout });
      });
    });
  },
  async plist(plistPath, key) {
    const result = await this.run(
      "/usr/libexec/PlistBuddy",
      ["-c", `Print :${key}`, plistPath],
      {
        cwd: path.dirname(plistPath),
        environment: process.env,
        timeoutMs: 15_000,
      },
    );
    if (result.exitCode !== 0)
      throw new Error(`ZCode Info.plist is missing ${key}`);
    return result.stdout.trim();
  },
};

export interface ZCodeRuntimePaths {
  installRoot: string;
  helper: string;
  cli: string;
  metadata: string;
  appAsar: string;
  infoPlist: string;
  hostIndex: string;
  hostRpcModule: string;
}

export interface ZCodeDiagnostic {
  available: boolean;
  reason: string;
  appVersion?: string;
  cliVersion?: string;
  cliIntegrity?: "verified" | "modified";
  hostArtifact: string;
  hostProtocol: string;
  hostIndexSha256?: string;
  hostRpcModuleSha256?: string;
  runtimeSmoke?: "passed" | "failed" | "not-run";
}

export interface ZCodeRuntime {
  paths: ZCodeRuntimePaths;
  diagnostic: ZCodeDiagnostic;
  runner: RuntimeCommandRunner;
}

export interface DiscoveryOptions {
  installRoot?: string;
  platform?: NodeJS.Platform;
  architecture?: string;
  environment?: NodeJS.ProcessEnv;
  runner?: RuntimeCommandRunner;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function resolveRequiredPath(
  root: string,
  candidate: string,
  executable = false,
): Promise<string> {
  const resolved = await fs.realpath(candidate);
  if (!isInside(root, resolved)) {
    throw new Error(
      `ZCode runtime path escapes the install root: ${candidate}`,
    );
  }
  await fs.access(
    resolved,
    executable ? fs.constants.R_OK | fs.constants.X_OK : fs.constants.R_OK,
  );
  return resolved;
}

function inspectHostScript(hostIndex: string, hostRpcModule: string): string {
  return String.raw`
const fs = require("node:fs");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const hash = value => crypto.createHash("sha256").update(fs.readFileSync(value)).digest("hex");
(async () => {
  const rpc = await import(pathToFileURL(${JSON.stringify(hostRpcModule)}).href);
  process.stdout.write(JSON.stringify({
    hostIndexSha256: hash(${JSON.stringify(hostIndex)}),
    hostRpcModuleSha256: hash(${JSON.stringify(hostRpcModule)}),
    exports: Object.keys(rpc).sort(),
  }));
})().catch(() => process.exit(1));`;
}

function unavailable(
  paths: ZCodeRuntimePaths,
  runner: RuntimeCommandRunner,
  reason: string,
  details: Partial<ZCodeDiagnostic> = {},
): ZCodeRuntime {
  return {
    paths,
    runner,
    diagnostic: {
      available: false,
      reason,
      hostArtifact: TARGET_ZCODE_HOST_ARTIFACT,
      hostProtocol: TARGET_ZCODE_HOST_PROTOCOL,
      runtimeSmoke: "not-run",
      ...details,
    },
  };
}

export async function discoverZCodeRuntime(
  options: DiscoveryOptions = {},
): Promise<ZCodeRuntime> {
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  if (platform !== "darwin" || architecture !== "arm64") {
    throw new Error("ZCode provider supports only macOS arm64");
  }
  const runner = options.runner ?? defaultRunner;
  const configuredRoot = options.installRoot ?? ZCODE_APP_PATH;
  if (!path.isAbsolute(configuredRoot))
    throw new Error("ZCode install root must be absolute");
  const installRoot = await fs.realpath(configuredRoot);
  const helper = await resolveRequiredPath(
    installRoot,
    path.join(
      installRoot,
      "Contents/Frameworks/ZCode Helper.app/Contents/MacOS/ZCode Helper",
    ),
    true,
  );
  const cli = await resolveRequiredPath(
    installRoot,
    path.join(installRoot, "Contents/Resources/glm/zcode.cjs"),
  );
  const metadata = await resolveRequiredPath(
    installRoot,
    path.join(installRoot, "Contents/Resources/glm/.node-bundle-meta.json"),
  );
  const appAsar = await resolveRequiredPath(
    installRoot,
    path.join(installRoot, "Contents/Resources/app.asar"),
  );
  const infoPlist = await resolveRequiredPath(
    installRoot,
    path.join(installRoot, "Contents/Info.plist"),
  );
  const paths: ZCodeRuntimePaths = {
    installRoot,
    helper,
    cli,
    metadata,
    appAsar,
    infoPlist,
    hostIndex: path.join(appAsar, TARGET_ZCODE_HOST_INDEX),
    hostRpcModule: path.join(appAsar, TARGET_ZCODE_RPC_MODULE),
  };
  const environment = {
    ...(options.environment ?? process.env),
    ELECTRON_RUN_AS_NODE: "1",
  };
  const metadataValue: unknown = JSON.parse(
    await fs.readFile(metadata, "utf8"),
  );
  try {
    MetadataSchema.parse(metadataValue);
  } catch {
    return unavailable(paths, runner, "ZCode bundle metadata is unsupported");
  }

  const [appVersion, cliHash, cliResult, hostResult] = await Promise.all([
    runner.plist(infoPlist, "CFBundleShortVersionString"),
    sha256File(cli),
    runner.run(helper, [cli, "version"], {
      cwd: installRoot,
      environment,
      timeoutMs: 15_000,
    }),
    runner.run(
      helper,
      ["-e", inspectHostScript(paths.hostIndex, paths.hostRpcModule)],
      {
        cwd: installRoot,
        environment,
        timeoutMs: 15_000,
      },
    ),
  ]);
  const cliVersion =
    cliResult.exitCode === 0
      ? cliResult.stdout.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/u)?.[0]
      : undefined;
  const cliIntegrity =
    cliHash === TARGET_ZCODE_CLI_SHA256 ? "verified" : "modified";
  if (
    appVersion !== TARGET_ZCODE_APP_VERSION ||
    cliVersion !== TARGET_ZCODE_CLI_VERSION
  ) {
    return unavailable(
      paths,
      runner,
      "ZCode app or CLI version is unsupported",
      {
        appVersion,
        ...(cliVersion === undefined ? {} : { cliVersion }),
        cliIntegrity,
      },
    );
  }
  if (hostResult.exitCode !== 0) {
    return unavailable(paths, runner, "ZCode host artifact inspection failed", {
      appVersion,
      cliVersion,
      cliIntegrity,
    });
  }

  let inspection: z.infer<typeof HostInspectionSchema>;
  try {
    inspection = HostInspectionSchema.parse(JSON.parse(hostResult.stdout));
  } catch {
    return unavailable(
      paths,
      runner,
      "ZCode host artifact inspection returned invalid data",
      {
        appVersion,
        cliVersion,
        cliIntegrity,
      },
    );
  }
  const requiredExports = new Set<string>(TARGET_ZCODE_RPC_EXPORTS);
  if (
    inspection.hostIndexSha256 !== TARGET_ZCODE_HOST_INDEX_SHA256 ||
    inspection.hostRpcModuleSha256 !== TARGET_ZCODE_RPC_SHA256 ||
    [...requiredExports].some((name) => !inspection.exports.includes(name))
  ) {
    return unavailable(
      paths,
      runner,
      "ZCode host artifact does not match the verified contract",
      {
        appVersion,
        cliVersion,
        cliIntegrity,
        hostIndexSha256: inspection.hostIndexSha256,
        hostRpcModuleSha256: inspection.hostRpcModuleSha256,
      },
    );
  }

  return {
    paths,
    runner,
    diagnostic: {
      available: true,
      reason:
        cliIntegrity === "verified"
          ? "ZCode runtime matches the verified contract"
          : "ZCode host contract matches; the CLI content is modified",
      appVersion,
      cliVersion,
      cliIntegrity,
      hostArtifact: TARGET_ZCODE_HOST_ARTIFACT,
      hostProtocol: TARGET_ZCODE_HOST_PROTOCOL,
      hostIndexSha256: inspection.hostIndexSha256,
      hostRpcModuleSha256: inspection.hostRpcModuleSha256,
      runtimeSmoke: "not-run",
    },
  };
}

export async function runZCodeRuntimeSmoke(
  runtime: ZCodeRuntime,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ZCodeDiagnostic> {
  if (!runtime.diagnostic.available) return runtime.diagnostic;
  const commandEnvironment = { ...environment, ELECTRON_RUN_AS_NODE: "1" };
  const [version, doctor] = await Promise.all([
    runtime.runner.run(runtime.paths.helper, [runtime.paths.cli, "version"], {
      cwd: runtime.paths.installRoot,
      environment: commandEnvironment,
      timeoutMs: 15_000,
    }),
    runtime.runner.run(
      runtime.paths.helper,
      [runtime.paths.cli, "doctor", "--json"],
      {
        cwd: runtime.paths.installRoot,
        environment: commandEnvironment,
        timeoutMs: 60_000,
      },
    ),
  ]);
  const passed = version.exitCode === 0 && doctor.exitCode === 0;
  return {
    ...runtime.diagnostic,
    available: passed,
    reason: passed
      ? runtime.diagnostic.reason
      : "ZCode bundled CLI runtime smoke failed",
    runtimeSmoke: passed ? "passed" : "failed",
  };
}

export function assertZCodeAvailable(diagnostic: ZCodeDiagnostic): void {
  if (!diagnostic.available || diagnostic.runtimeSmoke !== "passed") {
    throw new Error(`ZCode is unavailable: ${diagnostic.reason}`);
  }
}
