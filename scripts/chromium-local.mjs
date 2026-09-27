import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Extract the bundled test browser without trying to restore archive ownership.
// This is needed on Linux containers whose UID namespace cannot represent archive UIDs.
export function localChromium() {
  const dir = mkdtempSync(join(tmpdir(), "loveloom-chromium-"));
  const bins = resolve("node_modules/@sparticuz/chromium/bin");
  writeFileSync(
    join(dir, "chromium"),
    brotliDecompressSync(readFileSync(join(bins, "chromium.br"))),
    { mode: 0o700 },
  );
  for (const file of ["fonts.tar.br", "swiftshader.tar.br"]) {
    const result = spawnSync(
      "tar",
      ["--no-same-owner", "-xf", "-", "-C", dir],
      { input: brotliDecompressSync(readFileSync(join(bins, file))) },
    );
    if (result.status !== 0)
      throw new Error("Unable to unpack test browser resources");
  }
  return {
    executablePath: join(dir, "chromium"),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: dir,
      FONTCONFIG_PATH: join(dir, "fonts"),
    },
  };
}
