import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
const cacheDirs = [".next", ".turbo"].map((dir) => path.join(projectRoot, dir));
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const lockPath = path.join(projectRoot, ".dev-stable.lock");
const MAX_RECOVERY_ATTEMPTS = 1;

async function removeIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[dev:stable] cleared ${path.basename(targetPath)}`);
  } catch (error) {
    console.warn(`[dev:stable] could not clear ${targetPath}:`, error);
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock() {
  try {
    const current = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(current);
    if (isProcessRunning(parsed?.pid)) {
      console.error(
        `[dev:stable] another dev session is active (pid=${parsed.pid}). Close it first to avoid corrupt .next cache.`,
      );
      process.exit(1);
    }
    await fs.rm(lockPath, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("[dev:stable] lock check warning:", error);
    }
  }

  await fs.writeFile(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

async function releaseLock() {
  try {
    await fs.rm(lockPath, { force: true });
  } catch {
    // ignore
  }
}

function attachLifecycleCleanup() {
  const cleanupAndExit = async (exitCode) => {
    await releaseLock();
    process.exit(exitCode);
  };

  process.on("SIGINT", async () => cleanupAndExit(130));
  process.on("SIGTERM", async () => cleanupAndExit(143));
  process.on("uncaughtException", async (error) => {
    console.error("[dev:stable] uncaught exception:", error);
    await cleanupAndExit(1);
  });
}

async function canSpawnChildProcess() {
  let probe;
  try {
    probe = spawn(process.execPath, ["-e", "process.exit(0)"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  }
  try {
    await waitForExit(probe);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  }
}

function buildSpawnEnv() {
  return {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" "),
  };
}

function runDev(args) {
  try {
    return {
      child: spawn(process.execPath, [nextBin, "dev", ...args], {
        cwd: projectRoot,
        stdio: ["inherit", "pipe", "pipe"],
        env: buildSpawnEnv(),
      }),
      error: null,
    };
  } catch (error) {
    return { child: null, error };
  }
}

function isCorruptedNextRuntime(logChunk) {
  return (
    (logChunk.includes("Cannot find module './") && logChunk.includes(".next")) ||
    (logChunk.includes("MODULE_NOT_FOUND") && logChunk.includes(".next")) ||
    logChunk.includes("webpack-runtime.js")
  );
}

function forwardOutput(child, state) {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    if (isCorruptedNextRuntime(text)) {
      state.corruptedRuntimeDetected = true;
    }
    process.stderr.write(chunk);
  });
}

await acquireLock();
attachLifecycleCleanup();
await Promise.all(cacheDirs.map(removeIfExists));

const spawnAllowed = await canSpawnChildProcess();
if (!spawnAllowed) {
  console.error("[dev:stable] Node child-process spawn is blocked by the OS (EPERM).");
  console.error("[dev:stable] Please run terminal as Administrator and allow node.exe in Defender/EDR exclusions.");
  await releaseLock();
  process.exit(1);
}

async function startDevWithRecovery() {
  for (let attempt = 0; attempt <= MAX_RECOVERY_ATTEMPTS; attempt += 1) {
    const state = { corruptedRuntimeDetected: false };
    const first = runDev([]);
    if (first.error) {
      if (first.error?.code === "EPERM") {
        console.error("[dev:stable] next dev spawn blocked by OS policy (EPERM).");
        console.error("[dev:stable] Allow node.exe process spawn in Defender/EDR and run terminal with elevated rights.");
        await releaseLock();
        process.exit(1);
      }
      console.error("[dev:stable] failed to start next dev:", first.error);
      await releaseLock();
      process.exit(1);
    }

    let child = first.child;
    forwardOutput(child, state);

    const result = await new Promise((resolve) => {
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });

    if (result.error?.code === "EPERM") {
      console.warn("[dev:stable] next dev failed with EPERM, retrying with --turbopack...");
      const fallbackStart = runDev(["--turbopack"]);
      if (fallbackStart.error) {
        console.error("[dev:stable] fallback start failed:", fallbackStart.error);
        console.error("[dev:stable] This is an OS policy issue. Grant spawn rights to node.exe and project folder.");
        await releaseLock();
        process.exit(1);
      }
      child = fallbackStart.child;
      forwardOutput(child, state);

      const fallback = await new Promise((resolve) => {
        child.once("error", (error) => resolve({ error }));
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });

      if (fallback.error) {
        console.error("[dev:stable] fallback start failed:", fallback.error);
        console.error("[dev:stable] This is an OS policy issue. Grant spawn rights to node.exe and project folder.");
        await releaseLock();
        process.exit(1);
      }
      if (fallback.signal) {
        await releaseLock();
        process.kill(process.pid, fallback.signal);
        return;
      }
      await releaseLock();
      process.exit(fallback.code ?? 0);
    }

    if (result.error) {
      console.error("[dev:stable] failed to start next dev:", result.error);
      await releaseLock();
      process.exit(1);
    }

    if (result.signal) {
      await releaseLock();
      process.kill(process.pid, result.signal);
      return;
    }

    const shouldRecover = state.corruptedRuntimeDetected && attempt < MAX_RECOVERY_ATTEMPTS;
    if (shouldRecover) {
      console.warn("[dev:stable] detected corrupted .next runtime, cleaning cache and restarting once...");
      await Promise.all(cacheDirs.map(removeIfExists));
      continue;
    }

    await releaseLock();
    process.exit(result.code ?? 0);
  }
}

await startDevWithRecovery();
