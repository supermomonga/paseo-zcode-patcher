import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../src/cli.js";

describe("CLI arguments", () => {
  it("accepts only the fixed patch command", () => {
    expect(parseArguments(["patch"])).toEqual({ run: true });
    expect(() => parseArguments([])).toThrow(/Usage/u);
    expect(() => parseArguments(["patch", "--output", "/tmp/app"])).toThrow(
      /Usage/u,
    );
  });

  it("prints help without running", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(parseArguments(["--help"])).toEqual({ run: false });
    expect(log).toHaveBeenCalledWith("Usage: paseo-zcode-patcher patch");
    log.mockRestore();
  });
});
