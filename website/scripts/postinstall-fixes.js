"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const ganEsmEntry = path.join(
  rootDir,
  "node_modules",
  "gan-web-bluetooth",
  "dist",
  "esm",
  "index.mjs"
);

const originalImports = [
  "import { Subject } from 'rxjs';",
  "import { ModeOfOperation } from 'aes-js';",
].join("\n");

const patchedImports = [
  "import rxjs from 'rxjs';",
  "const { Subject } = rxjs;",
  "import aesJs from 'aes-js';",
  "const { ModeOfOperation } = aesJs;",
].join("\n");

function patchGanWebBluetooth() {
  if (!fs.existsSync(ganEsmEntry)) {
    console.warn("[postinstall] gan-web-bluetooth ESM entry not found, skipping patch");
    return;
  }

  const current = fs.readFileSync(ganEsmEntry, "utf8");

  if (current.includes(patchedImports)) {
    console.log("[postinstall] gan-web-bluetooth already patched");
    return;
  }

  if (!current.includes(originalImports)) {
    throw new Error(
      "[postinstall] Could not find expected gan-web-bluetooth import block to patch"
    );
  }

  const next = current.replace(originalImports, patchedImports);
  fs.writeFileSync(ganEsmEntry, next, "utf8");
  console.log("[postinstall] patched gan-web-bluetooth ESM imports");
}

patchGanWebBluetooth();
