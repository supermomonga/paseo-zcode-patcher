import fs from "node:fs/promises";
import path from "node:path";

import { sha256File } from "./hashes.js";
import { captureCommand, runCommand } from "./system.js";

interface InventoryEntry {
  type: "directory" | "file" | "symlink";
  mode: bigint;
  uid: bigint;
  gid: bigint;
  size: bigint;
  mtimeSeconds: bigint;
  birthtimeSeconds: bigint;
  contents?: string;
}

function formatSetFileDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function walk(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative);
  const children = await fs.readdir(directory, { withFileTypes: true });
  const results: string[] = [];
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    const childRelative = relative
      ? path.join(relative, child.name)
      : child.name;
    results.push(childRelative);
    if (child.isDirectory()) results.push(...(await walk(root, childRelative)));
  }
  return results;
}

export async function restoreSymlinkTimestamps(
  sourceRoot: string,
  destinationRoot: string,
) {
  for (const relative of await walk(sourceRoot)) {
    const source = path.join(sourceRoot, relative);
    const sourceStat = await fs.lstat(source);
    if (!sourceStat.isSymbolicLink()) continue;
    const destination = path.join(destinationRoot, relative);
    await runCommand("/usr/bin/SetFile", [
      "-P",
      "-d",
      formatSetFileDate(sourceStat.birthtime),
      destination,
    ]);
    await fs.lutimes(destination, sourceStat.atime, sourceStat.mtime);
  }
}

async function inventory(
  root: string,
  ignoredRelativePaths: ReadonlySet<string>,
): Promise<Map<string, InventoryEntry>> {
  const result = new Map<string, InventoryEntry>();
  for (const relative of ["", ...(await walk(root))]) {
    if (ignoredRelativePaths.has(relative)) continue;
    const absolute = path.join(root, relative);
    const stat = await fs.lstat(absolute, { bigint: true });
    const type = stat.isDirectory()
      ? "directory"
      : stat.isFile()
        ? "file"
        : "symlink";
    let contents: string | undefined;
    if (type === "file") contents = await sha256File(absolute);
    else if (type === "symlink") contents = await fs.readlink(absolute);
    result.set(relative, {
      type,
      mode: stat.mode,
      uid: stat.uid,
      gid: stat.gid,
      size: stat.size,
      mtimeSeconds: stat.mtimeNs / 1_000_000_000n,
      birthtimeSeconds: stat.birthtimeNs / 1_000_000_000n,
      ...(contents === undefined ? {} : { contents }),
    });
  }
  return result;
}

function normalizedXattrs(
  output: string,
  root: string,
  options: { ignoreRootMacl?: boolean },
): string {
  return output
    .replaceAll(root, "<APP>")
    .split("\n")
    .filter(
      (line) =>
        !options.ignoreRootMacl || !line.startsWith("<APP>: com.apple.macl:"),
    )
    .join("\n");
}

export async function verifyBundleXattrs(
  sourceRoot: string,
  destinationRoot: string,
  options: { ignoreRootMacl?: boolean } = {},
): Promise<void> {
  const [sourceXattrs, destinationXattrs] = await Promise.all([
    captureCommand("/usr/bin/xattr", ["-lr", sourceRoot]),
    captureCommand("/usr/bin/xattr", ["-lr", destinationRoot]),
  ]);
  if (
    normalizedXattrs(sourceXattrs, sourceRoot, options) !==
    normalizedXattrs(destinationXattrs, destinationRoot, options)
  ) {
    throw new Error(
      "application copy extended attributes do not match the source",
    );
  }
}

export async function verifyBundleCopy(
  sourceRoot: string,
  destinationRoot: string,
  ignoredRelativePaths: readonly string[],
): Promise<void> {
  const ignored = new Set(ignoredRelativePaths);
  const [sourceInventory, destinationInventory] = await Promise.all([
    inventory(sourceRoot, ignored),
    inventory(destinationRoot, ignored),
  ]);
  if (sourceInventory.size !== destinationInventory.size) {
    throw new Error("application copy contains a different number of entries");
  }
  for (const [relative, expected] of sourceInventory) {
    const actual = destinationInventory.get(relative);
    if (
      !actual ||
      JSON.stringify(actual, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ) !==
        JSON.stringify(expected, (_, value) =>
          typeof value === "bigint" ? String(value) : value,
        )
    ) {
      throw new Error(
        `application copy metadata or content mismatch: ${relative || "."}`,
      );
    }
  }
  await verifyBundleXattrs(sourceRoot, destinationRoot);
}
