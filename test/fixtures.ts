import type { PatchManifest } from "../src/manifest.js";

export function manifestFixture(sourceAsarSha256: string): PatchManifest {
  return {
    artifactId: "paseo-0.7.2-arm64",
    paseo: {
      version: "0.7.2",
      commit: "9400a49af670fdb5db4af58e73f8df98588dbea9",
      platform: "darwin",
      arch: "arm64",
      sourceAsarSha256,
      patchedAsarSha256: "",
    },
    zcode: {
      appVersion: "3.11.2",
      cliVersion: "0.16.5",
      cliSha256:
        "e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8",
      artifact: "zcode-host-3.11.2",
      protocol: "zcode-task-v1",
      hostIndexSha256:
        "30911a90dadc5c384959d00d95ccc70c8cf38c74a9cb99c3168b0897d046d215",
      hostRpcModuleSha256:
        "e66203598b60d8728260ad7631f295f9d6deb8276b06e8f0cab8776773c75b31",
      requiredExports: ["g", "i", "j"],
      referenceCommit: "7b3af187d7ee732e9043aed873a863fc855625c2",
    },
    patchFormat: "header-preserving-append-v1",
    markerPath: "paseo-zcode-patcher.json",
    overlayHash: "0".repeat(64),
    entries: [],
  };
}
