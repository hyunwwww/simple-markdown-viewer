const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const sourcePath = path.join(rootDir, "theme.cfg");
  const outputDir = path.join(rootDir, "dist");
  const targetPath = path.join(outputDir, "theme.cfg");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  console.log(`[theme] copied ${path.relative(rootDir, sourcePath)} -> ${path.relative(rootDir, targetPath)}`);
}

main().catch((error) => {
  console.error(`[theme] failed to copy portable theme.cfg: ${error.message}`);
  process.exit(1);
});
