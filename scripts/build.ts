import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

interface ExtensionManifest {
  host_permissions: string[];
  content_scripts: Array<{ matches: string[] }>;
  [key: string]: unknown;
}

const projectRoot = resolve(import.meta.dirname, "..");
const e2e = process.env.EXPORTER_E2E === "1";
const outputDirectory = resolve(projectRoot, e2e ? "dist-e2e" : "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(projectRoot, "src/content.ts")],
    outfile: resolve(outputDirectory, "content.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    legalComments: "none",
  }),
  build({
    entryPoints: [resolve(projectRoot, "src/service-worker.ts")],
    outfile: resolve(outputDirectory, "service-worker.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    legalComments: "none",
  }),
  build({
    entryPoints: [resolve(projectRoot, "src/page-bridge.ts")],
    outfile: resolve(outputDirectory, "page-bridge.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    legalComments: "none",
  }),
  ...(e2e
    ? [
        build({
          entryPoints: [resolve(projectRoot, "tests/e2e/fixture-client.ts")],
          outfile: resolve(outputDirectory, "fixture-client.js"),
          bundle: true,
          format: "iife",
          platform: "browser",
          target: "chrome120",
          legalComments: "none",
        }),
      ]
    : []),
]);

const manifest = JSON.parse(
  await readFile(resolve(projectRoot, "manifest.json"), "utf8"),
) as ExtensionManifest;

if (e2e) {
  const fixtureHosts = ["http://127.0.0.1/*", "http://localhost/*"];
  manifest.host_permissions.push(...fixtureHosts);
  for (const script of manifest.content_scripts)
    script.matches.push(...fixtureHosts);
}

await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

await cp(
  resolve(projectRoot, "README.md"),
  resolve(outputDirectory, "README.md"),
);
