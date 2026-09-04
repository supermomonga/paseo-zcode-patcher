#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { patchCommand } from "./commands/patch.js";

function usage(): string {
  return "Usage: paseo-zcode-patcher patch";
}

export function parseArguments(argv: string[]): { run: boolean } {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(usage());
    return { run: false };
  }
  if (argv.length !== 1 || argv[0] !== "patch") {
    throw new Error(usage());
  }
  return { run: true };
}

async function main(): Promise<void> {
  if (!parseArguments(process.argv.slice(2)).run) return;
  await patchCommand();
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
