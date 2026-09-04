import { describe, expect, it } from "vitest";

import {
  assertZCodeAvailable,
  discoverZCodeRuntime,
  runZCodeRuntimeSmoke,
  type RuntimeCommandRunner,
  type ZCodeRuntime,
} from "../src/zcode-runtime.js";

describe("ZCode runtime", () => {
  it("rejects every platform other than macOS arm64 before discovery", async () => {
    await expect(
      discoverZCodeRuntime({ platform: "linux", architecture: "arm64" }),
    ).rejects.toThrow(/macOS arm64/u);
    await expect(
      discoverZCodeRuntime({ platform: "darwin", architecture: "x64" }),
    ).rejects.toThrow(/macOS arm64/u);
  });

  it("requires both bundled CLI smoke commands to succeed", async () => {
    const calls: string[][] = [];
    const runner: RuntimeCommandRunner = {
      async run(_command, args) {
        calls.push([...args]);
        return { exitCode: args.includes("doctor") ? 1 : 0, stdout: "" };
      },
      async plist() {
        return "3.11.2";
      },
    };
    const runtime = {
      paths: {
        installRoot: "/Applications/ZCode.app",
        helper: "/Applications/ZCode.app/helper",
        cli: "/Applications/ZCode.app/zcode.cjs",
        metadata: "/Applications/ZCode.app/meta.json",
        appAsar: "/Applications/ZCode.app/app.asar",
        infoPlist: "/Applications/ZCode.app/Info.plist",
        hostIndex: "/Applications/ZCode.app/app.asar/out/host/index.js",
        hostRpcModule: "/Applications/ZCode.app/app.asar/out/host/rpc.js",
      },
      runner,
      diagnostic: {
        available: true,
        reason: "verified",
        hostArtifact: "zcode-host-3.11.2",
        hostProtocol: "zcode-task-v1",
        runtimeSmoke: "not-run",
      },
    } satisfies ZCodeRuntime;
    const result = await runZCodeRuntimeSmoke(runtime, {});
    expect(result).toMatchObject({ available: false, runtimeSmoke: "failed" });
    expect(calls).toEqual([
      [runtime.paths.cli, "version"],
      [runtime.paths.cli, "doctor", "--json"],
    ]);
    expect(() => assertZCodeAvailable(result)).toThrow(/unavailable/u);
  });

  it.runIf(process.env.RUN_ZCODE_RUNTIME_TEST === "1")(
    "matches the installed fixed ZCode artifact",
    async () => {
      const result = await runZCodeRuntimeSmoke(await discoverZCodeRuntime());
      expect(result).toMatchObject({
        available: true,
        appVersion: "3.11.2",
        cliVersion: "0.16.5",
        cliIntegrity: "verified",
        hostArtifact: "zcode-host-3.11.2",
        hostProtocol: "zcode-task-v1",
        runtimeSmoke: "passed",
      });
    },
  );
});
