import { cpSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// Create the public cloud beta. The browser receives only Supabase's publishable
// key; database access remains protected by authenticated RPC functions and RLS.
const root = process.cwd(),
  stage = join(root, ".beta-build"),
  out = join(root, "out");
const base = process.env.PAGES_BASE_PATH || "";
if (base && !/^\/[A-Za-z0-9_.-]+$/.test(base))
  throw new Error("Invalid Pages base path");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "app"), { recursive: true });
mkdirSync(join(stage, "lib"));
for (const dir of ["components", "public"])
  cpSync(join(root, dir), join(stage, dir), { recursive: true });
for (const file of ["layout.tsx", "globals.css", "sketch.css"])
  cpSync(join(root, "app", file), join(stage, "app", file));
for (const file of [
  "types.ts",
  "preview.ts",
  "assets.ts",
  "cloud.ts",
  "garden.ts",
  "media.ts",
  "voice.ts",
  "push.ts",
])
  cpSync(join(root, "lib", file), join(stage, "lib", file));
for (const file of ["package.json", "tsconfig.json", "next-env.d.ts"])
  cpSync(join(root, file), join(stage, file));
symlinkSync(
  join(root, "node_modules"),
  join(stage, "node_modules"),
  "junction",
);
writeFileSync(
  join(stage, "app/page.tsx"),
  'import LoveLoom from "@/components/loveloom"; export default function Page(){return <LoveLoom cloud/>;}\n',
);
writeFileSync(
  join(stage, "next.config.mjs"),
  `export default {output:'export',basePath:${JSON.stringify(base)},images:{unoptimized:true},trailingSlash:true,poweredByHeader:false,turbopack:{root:${JSON.stringify(root)}}};\n`,
);
writeFileSync(
  join(stage, "public/manifest.webmanifest"),
  JSON.stringify({
    name: "LoveLoom · облачная beta",
    short_name: "LoveLoom",
    lang: "ru",
    start_url: base + "/",
    scope: base + "/",
    display: "standalone",
    description: "Личное пространство LoveLoom для двух людей",
    background_color: "#faf6ee",
    theme_color: "#faf6ee",
    icons: [
      { src: base + "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: base + "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }),
);
const result = spawnSync(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "build"],
  {
    cwd: stage,
    env: {
      ...process.env,
      NEXT_PUBLIC_BASE_PATH: base,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  },
);
if (result.status !== 0) process.exit(result.status || 1);
rmSync(out, { recursive: true, force: true });
cpSync(join(stage, "out"), out, { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");
console.log(
  "Static cloud beta ready in out/. Supabase access is RLS-protected.",
);
