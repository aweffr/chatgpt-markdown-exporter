import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const extensionPath = resolve(projectRoot, "dist-e2e");
const configDirectory = resolve(projectRoot, ".playwright");

await mkdir(configDirectory, { recursive: true });
await writeFile(
  resolve(configDirectory, "cli.config.json"),
  `${JSON.stringify(
    {
      browser: {
        browserName: "chromium",
        isolated: false,
        userDataDir: resolve(projectRoot, ".playwright-profile"),
        launchOptions: {
          headless: false,
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        },
        contextOptions: {
          acceptDownloads: true,
          viewport: { width: 1280, height: 900 },
        },
      },
      outputDir: resolve(projectRoot, "test-results/playwright-cli"),
    },
    null,
    2,
  )}\n`,
);
