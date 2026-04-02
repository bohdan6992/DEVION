import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
const cacheDirs = [".next", ".turbo"].map((dir) => path.join(projectRoot, dir));
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const MAX_RETRY = 1;

async function removeIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[build:stable] cleared ${path.basename(targetPath)}`);
  } catch (error) {
    console.warn(`[build:stable] could not clear ${targetPath}:`, error);
  }
}

function runBuild() {
  try {
    return {
      child: spawn(process.execPath, [nextBin, "build"], {
        cwd: projectRoot,
        stdio: ["inherit", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" "),
        },
      }),
      error: null,
    };
  } catch (error) {
    return { child: null, error };
  }
}

function hasCorruptedCacheSignals(logChunk) {
  return (
    (logChunk.includes("Cannot find module './") && logChunk.includes(".next")) ||
    (logChunk.includes("MODULE_NOT_FOUND") && logChunk.includes(".next")) ||
    logChunk.includes("webpack-runtime.js")
  );
}

function streamAndTrack(child, state) {
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    if (hasCorruptedCacheSignals(text)) state.corruptedCacheDetected = true;
    process.stderr.write(chunk);
  });
}

for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
  if (attempt > 0) {
    console.warn("[build:stable] retrying build after cache cleanup...");
    await Promise.all(cacheDirs.map(removeIfExists));
  }

  const state = { corruptedCacheDetected: false };
  const { child, error: spawnError } = runBuild();
  if (spawnError) {
    console.error("[build:stable] build spawn blocked by OS policy:", spawnError);
    console.error("[build:stable] Allow node.exe process spawn in Defender/EDR and run terminal with elevated rights.");
    process.exit(1);
  }

  streamAndTrack(child, state);

  const result = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (result.error) {
    console.error("[build:stable] failed to start build:", result.error);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
    process.exit(1);
  }

  const failed = (result.code ?? 0) !== 0;
  const canRetry = attempt < MAX_RETRY && (state.corruptedCacheDetected || failed);
  if (canRetry) {
    continue;
  }

  process.exit(result.code ?? 0);
}
