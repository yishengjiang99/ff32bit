const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const html = walk(dist).find((file) => file.endsWith(".html"));
if (!html) {
  console.error("stage-pages: no html in dist/. Run vite build first.");
  process.exit(1);
}

fs.copyFileSync(html, path.join(root, "index.html"));
if (path.basename(html) !== "index.html") {
  fs.copyFileSync(html, path.join(dist, "index.html"));
}

const ffplayer = path.join(dist, "ffplayer.js");
if (!fs.existsSync(ffplayer)) {
  console.error("stage-pages: dist/ffplayer.js missing");
  process.exit(1);
}
fs.copyFileSync(ffplayer, path.join(root, "ffplayer.js"));

const assetsSrc = path.join(dist, "assets");
const assetsDest = path.join(root, "assets");
fs.rmSync(assetsDest, { recursive: true, force: true });
fs.mkdirSync(assetsDest, { recursive: true });
for (const name of fs.readdirSync(assetsSrc)) {
  fs.copyFileSync(path.join(assetsSrc, name), path.join(assetsDest, name));
}

fs.writeFileSync(path.join(root, ".nojekyll"), "");
console.log("staged pages files from", path.relative(root, html));
