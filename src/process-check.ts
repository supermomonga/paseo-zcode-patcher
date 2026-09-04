import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  OUTPUT_APP_PATH,
  SOURCE_APP_PATH,
  ZCODE_APP_PATH,
} from "./constants.js";

const execFileAsync = promisify(execFile);

export interface RelatedProcess {
  pid: number;
  executable: string;
  command: string;
}

export function parseRelatedProcesses(
  output: string,
  ownPid = process.pid,
): RelatedProcess[] {
  const matches: RelatedProcess[] = [];
  for (const line of output.split("\n")) {
    const parsed = /^\s*(\d+)\s+(\S+)\s+(.*)$/u.exec(line);
    if (!parsed) continue;
    const pid = Number(parsed[1]);
    const executable = parsed[2] ?? "";
    const command = parsed[3] ?? "";
    if (pid === ownPid) continue;
    const executableName = executable.split("/").pop() ?? executable;
    const installedApp = [
      SOURCE_APP_PATH,
      OUTPUT_APP_PATH,
      ZCODE_APP_PATH,
    ].some(
      (root) =>
        executable.startsWith(`${root}/`) || command.includes(`${root}/`),
    );
    const paseoName = /^(Paseo|Paseo Helper(?: \([^)]*\))?)$/u.test(
      executableName,
    );
    const paseoService =
      command.includes("supervisor-entrypoint") ||
      (command.includes("daemon-entrypoint") && command.includes("app.asar"));
    const zcodeHost =
      command.includes("ZCode Helper") &&
      (command.includes("out/host/index.js") ||
        command.includes("ELECTRON_RUN_AS_NODE"));
    if (installedApp || paseoName || paseoService || zcodeHost) {
      matches.push({ pid, executable, command });
    }
  }
  return matches;
}

export async function findRunningRelatedProcesses(): Promise<RelatedProcess[]> {
  const { stdout } = await execFileAsync(
    "ps",
    ["-axo", "pid=,comm=,command="],
    {
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return parseRelatedProcesses(stdout);
}
