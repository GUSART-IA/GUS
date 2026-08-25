#!/usr/bin/env node
/**
 * descargar.mjs
 * ---------------------------------------------------------------------------
 * Descarga a disco los assets que Higgsfield devolvio como URLs y reescribe el
 * manifiesto con rutas locales, listo para HF_ImportarAssets.jsx.
 *
 *   node higgsfield/descargar.mjs [manifiesto.json]
 *
 * Entrada  : entradas con "url"
 * Salida   : mismos objetos con "file" relativo al manifiesto (carpeta assets/)
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const manifiestoPath = path.resolve(process.argv[2] ?? "higgsfield/manifest.json");
const carpetaBase = path.dirname(manifiestoPath);
const carpetaAssets = path.join(carpetaBase, "assets");

const EXT_POR_TIPO = {
  video: ".mp4",
  image: ".png",
  audio: ".mp3",
};

function nombreDesdeUrl(url, slot, indice) {
  const limpio = new URL(url).pathname.split("/").pop() ?? "";
  const ext = path.extname(limpio);
  if (ext) return `${String(indice).padStart(2, "0")}-${slot.toLowerCase()}${ext}`;
  return `${String(indice).padStart(2, "0")}-${slot.toLowerCase()}${EXT_POR_TIPO.video}`;
}

async function descargar(url, destino) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
}

const manifiesto = JSON.parse(await readFile(manifiestoPath, "utf8"));
const assets = manifiesto.assets ?? [];
if (assets.length === 0) {
  console.error("El manifiesto no tiene assets.");
  process.exit(1);
}

await mkdir(carpetaAssets, { recursive: true });

let descargados = 0;
const fallos = [];

for (const [i, asset] of assets.entries()) {
  if (!asset.url) {
    if (!asset.file) fallos.push(`#${i + 1}: sin "url" ni "file"`);
    continue;
  }
  const slot = asset.slot ?? "broll";
  const nombre = nombreDesdeUrl(asset.url, slot, i + 1);
  const destino = path.join(carpetaAssets, nombre);
  try {
    await descargar(asset.url, destino);
    asset.file = path.join("assets", nombre);
    descargados += 1;
    console.log(`ok  ${slot.padEnd(6)} -> ${asset.file}`);
  } catch (err) {
    fallos.push(`#${i + 1} (${slot}): ${err.message}`);
    console.error(`err ${slot.padEnd(6)} -> ${err.message}`);
  }
}

await writeFile(manifiestoPath, `${JSON.stringify(manifiesto, null, 2)}\n`, "utf8");

console.log(`\nDescargados ${descargados}/${assets.length}. Manifiesto actualizado.`);
if (fallos.length > 0) {
  console.log(`Fallos:\n- ${fallos.join("\n- ")}`);
  process.exit(1);
}
