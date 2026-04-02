import fs from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
const cacheDirs = [".next", ".turbo"].map((dir) => path.join(projectRoot, dir));

async function removeIfExists(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[clean] removed ${path.basename(targetPath)}`);
  } catch (error) {
    console.warn(`[clean] failed to remove ${targetPath}:`, error);
  }
}

await Promise.all(cacheDirs.map(removeIfExists));
