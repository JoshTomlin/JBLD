// Serve PGlite's native ESM and WASM files together. CRA 4 treats its .cjs entry
// as a file URL, rather than an executable module.
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const packageDir = path.resolve(path.dirname(require.resolve("@electric-sql/pglite")), "..");
const { version } = require(path.join(packageDir, "package.json"));
const runtimeFiles = fs.readdirSync(path.join(packageDir, "dist")).filter((name) => /\.(js|wasm|data)$/.test(name));
fs.writeFileSync(path.join(root, "src", "data", "databaseRuntime.js"), `// Generated from the installed PGlite package before start/build.\nexport const pgliteVersion = ${JSON.stringify(version)};\nexport const pgliteRuntimeFiles = ${JSON.stringify(runtimeFiles, null, 2)};\n`);
const target = path.join(root, "public", "pglite", version);
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(packageDir, "dist"), target, {
  recursive: true,
  filter: (source) => fs.statSync(source).isDirectory() || /\.(js|wasm|data|tar\.gz)$/.test(source),
});
console.log(`Prepared PGlite ${version} browser runtime`);
