import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256Buffer(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function computeOverlayHash(
  entries: Array<{ path: string; sha256: string }>,
): string {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}
