import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
const files = {};
const add = (path) => {
  files[`ElectionBroadcast2026/${path.replaceAll("\\", "/")}`] = new Uint8Array(
    readFileSync(path),
  );
};
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) add(path);
  }
};
for (const directory of [
  "apps",
  "packages",
  "docs",
  "scripts",
  "tests",
  "dist",
])
  walk(directory);
for (const path of [
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "eslint.config.js",
  ".env.example",
  ".gitignore",
  ".prettierignore",
  "INSTALAR.bat",
  "INICIAR-SIMULADO.bat",
  "INICIAR-OFICIAL.bat",
])
  add(path);
for (const path of [
  "photo-verification.json",
  "photos-tse-1920x1080.png",
  "photos-tse-sim-1920x1080.png",
  "local-verification.json",
  "simulation-verification.json",
  "studio-official-1920x1080.png",
  "overlay-official-waiting.png",
  "studio-simulado-tse-1920x1080.png",
  "overlay-simulado-tse.png",
])
  add(`artifacts/${path}`);
const zip = zipSync(files, { level: 6 });
mkdirSync("artifacts", { recursive: true });
const name = "election-broadcast-2026.zip";
writeFileSync(`artifacts/${name}`, zip);
writeFileSync(
  `artifacts/${name}.sha256`,
  `${createHash("sha256").update(zip).digest("hex")}  ${name}\n`,
);
console.log(
  JSON.stringify({
    archive: `artifacts/${name}`,
    files: Object.keys(files).length,
    bytes: zip.length,
  }),
);
