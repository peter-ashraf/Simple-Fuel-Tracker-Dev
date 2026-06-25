import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(
  repoRoot,
  "node_modules",
  "@imgly",
  "background-removal",
  "package.json",
);
const publicAssetsDir = path.join(repoRoot, "public", "background-removal");
const tempDir = path.join(repoRoot, "node_modules", ".cache", "sft-bg-removal-assets");

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });

const downloadFile = async (url, destination) => {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    const stream = Readable.fromWeb(response.body);

    stream.on("error", reject);
    stream.pipe(file);

    file.on("finish", resolve);
    file.on("error", reject);
  });
};

const main = async () => {
  console.log("[bg-removal] Preparing local background-removal assets...");

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.version;

  if (!version) {
    throw new Error("Could not determine @imgly/background-removal version.");
  }

  const archiveUrl = `https://staticimgly.com/@imgly/background-removal-data/${version}/package.tgz`;
  const archivePath = path.join(tempDir, `background-removal-data-${version}.tgz`);
  const extractDir = path.join(tempDir, "extract");
  const packageDistDir = path.join(extractDir, "package", "dist");

  await rm(tempDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  await mkdir(publicAssetsDir, { recursive: true });

  try {
    console.log(`[bg-removal] Downloading ${archiveUrl}`);
    await downloadFile(archiveUrl, archivePath);

    console.log("[bg-removal] Extracting model/WASM package...");
    await run("tar", ["-xzf", archivePath, "-C", extractDir]);

    console.log(`[bg-removal] Copying assets to ${publicAssetsDir}`);
    await rm(publicAssetsDir, { recursive: true, force: true });
    await mkdir(publicAssetsDir, { recursive: true });
    await cp(packageDistDir, publicAssetsDir, { recursive: true });

    console.log("[bg-removal] Local background-removal assets are ready.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("[bg-removal] Failed to set up local assets.");
  console.error(error);
  process.exitCode = 1;
});
