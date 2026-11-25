#!/usr/bin/env node
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(rootDir, "dist", "client");
const workerEntry = path.join(rootDir, "dist", "server", "index.js");
const outDir = path.join(rootDir, "out");
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(clientDir, outDir, { recursive: true });
await rm(path.join(outDir, ".vite"), { recursive: true, force: true });

const workerUrl = pathToFileURL(workerEntry);
workerUrl.searchParams.set("export", String(Date.now()));
const { default: worker } = await import(workerUrl.href);

const requestPath = `${basePath || ""}/`;
const response = await worker.fetch(
  new Request(`http://localhost${requestPath}`, { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
);

if (response.status !== 200) {
  throw new Error(`Static prerender failed for ${requestPath} with HTTP ${response.status}`);
}

const rawHtml = await response.text();
if (!rawHtml.includes('id="hero-title"')) {
  throw new Error("Prerendered HTML is missing #hero-title");
}

// In pure static hosting (GitHub Pages), hash/popstate transitions stay within the
// prerendered SPA document and must not fetch non-existent `/*.rsc` server endpoints.
const staticSpaGuard = `<script>(function(){var noop=function(){return Promise.resolve();};Object.defineProperty(window,"__VINEXT_RSC_NAVIGATE__",{configurable:true,get:function(){return noop;},set:function(){}});})();</script>`;
const html = rawHtml.replace("</head>", `${staticSpaGuard}</head>`);

await writeFile(path.join(outDir, "index.html"), html, "utf8");
await writeFile(path.join(outDir, "404.html"), html, "utf8");
await writeFile(path.join(outDir, ".nojekyll"), "", "utf8");

await stat(path.join(outDir, "audio", "consonant-human-onset", "ssang-siot.wav"));
console.log(`Exported static site to ${outDir} (basePath: ${basePath || "/"})`);
