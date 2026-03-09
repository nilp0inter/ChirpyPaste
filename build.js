const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const watch = args.includes("--watch");
const targets = [];
if (args.includes("--target")) {
  const idx = args.indexOf("--target");
  if (args[idx + 1]) targets.push(args[idx + 1]);
}
if (targets.length === 0) targets.push("chrome", "firefox");

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.cpSync(src, dest, {recursive: true});
}

async function build(target) {
  const outDir = path.join("dist", target);
  fs.mkdirSync(outDir, {recursive: true});
  fs.mkdirSync(path.join(outDir, "icons"), {recursive: true});

  // Bundle popup.js
  await esbuild.build({
    entryPoints: ["src/popup/popup.js"],
    bundle: true,
    format: "iife",
    outfile: path.join(outDir, "popup.js"),
    minify: prod,
    sourcemap: !prod,
  });

  // Bundle content-script.js
  await esbuild.build({
    entryPoints: ["src/content/content-script.js"],
    bundle: true,
    format: "iife",
    outfile: path.join(outDir, "content-script.js"),
    minify: prod,
    sourcemap: !prod,
  });

  // Copy static files
  copyFile("src/popup/popup.html", path.join(outDir, "popup.html"));
  copyFile("src/popup/popup.css", path.join(outDir, "popup.css"));

  // Copy manifest
  const manifestSrc = target === "firefox" ? "manifest.firefox.json" : "manifest.chrome.json";
  copyFile(manifestSrc, path.join(outDir, "manifest.json"));

  // Copy icons
  const iconSizes = [16, 32, 48, 128];
  for (const size of iconSizes) {
    const iconFile = `icon-${size}.png`;
    const iconSrc = path.join("icons", iconFile);
    if (fs.existsSync(iconSrc)) {
      copyFile(iconSrc, path.join(outDir, "icons", iconFile));
    }
  }

  console.log(`Built ${target} → dist/${target}/`);
}

async function main() {
  for (const target of targets) {
    await build(target);
  }

  if (watch) {
    console.log("Watching for changes...");
    const ctx1 = await esbuild.context({
      entryPoints: ["src/popup/popup.js"],
      bundle: true,
      format: "iife",
      outfile: path.join("dist", targets[0], "popup.js"),
      sourcemap: true,
    });
    const ctx2 = await esbuild.context({
      entryPoints: ["src/content/content-script.js"],
      bundle: true,
      format: "iife",
      outfile: path.join("dist", targets[0], "content-script.js"),
      sourcemap: true,
    });
    await ctx1.watch();
    await ctx2.watch();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
