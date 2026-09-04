import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertMinimumNodeVersion,
  removeValidatedOutput,
} from "../src/commands/patch.js";

describe("runtime version", () => {
  it.each(["22.12.0", "22.12.1", "23.0.0"])("accepts Node.js %s", (version) => {
    expect(() => assertMinimumNodeVersion(version)).not.toThrow();
  });

  it.each(["21.99.0", "22.11.99"])("rejects Node.js %s", (version) => {
    expect(() => assertMinimumNodeVersion(version)).toThrow(/22\.12\.0/u);
  });
});

describe("validated output removal", () => {
  it("unlinks a symlink without touching its target", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "paseo-zcode-output-"),
    );
    const target = path.join(directory, "target");
    const link = path.join(directory, "PaseoZCode.app");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "kept"), "yes");
    await fs.symlink(target, link);
    await removeValidatedOutput(link, link);
    await expect(fs.lstat(link)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(path.join(target, "kept"), "utf8")).resolves.toBe(
      "yes",
    );
    await fs.rm(directory, { recursive: true });
  });

  it("refuses a path that differs from the validated target", async () => {
    await expect(
      removeValidatedOutput("/tmp/unexpected", "/tmp/expected"),
    ).rejects.toThrow(/unvalidated output path/u);
  });
});
