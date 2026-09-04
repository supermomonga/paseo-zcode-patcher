import { describe, expect, it } from "vitest";

import { parseRelatedProcesses } from "../src/process-check.js";

describe("related process detection", () => {
  it("reports Paseo, patched Paseo, and ZCode host processes", () => {
    const output = `
  10 /Applications/Paseo.app/Contents/MacOS/Paseo /Applications/Paseo.app/Contents/MacOS/Paseo
  11 /Applications/Paseo.app/Contents/Frameworks/PaseoHelper /Applications/Paseo.app/Contents/Frameworks/PaseoHelper --type=renderer
  12 /usr/local/bin/node /Applications/PaseoZCode.app/Contents/Resources/app.asar daemon-entrypoint
  13 /Applications/ZCode.app/Contents/Frameworks/ZCodeHelper /Applications/ZCode.app/Contents/Frameworks/ZCodeHelper out/host/index.js
  14 /bin/bash bash -lc echo unrelated
`;
    expect(
      parseRelatedProcesses(output, 999).map((entry) => entry.pid),
    ).toEqual([10, 11, 12, 13]);
  });
});
