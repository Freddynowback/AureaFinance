#!/usr/bin/env node
/**
 * Genera assets/icons/index.js a partir de los SVG revisados en
 * assets/icons/{generic,brands}. Los iconos quedan empaquetados en la app
 * (sin descargas en tiempo de ejecución) y se renderizan con SvgXml.
 * Ejecutar: node scripts/build-icons.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'assets', 'icons');
const FORBIDDEN = /<script|foreignObject|<style|\son[a-z]+=|(?:xlink:)?href="(?!#)/i;

function load(dir) {
  const out = {};
  for (const file of fs.readdirSync(path.join(root, dir)).sort()) {
    if (!file.endsWith('.svg')) continue;
    let xml = fs.readFileSync(path.join(root, dir, file), 'utf8');
    if (FORBIDDEN.test(xml)) throw new Error(`SVG rechazado por seguridad: ${dir}/${file}`);
    xml = xml
      .replace(/<\?xml[^>]*>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\sclass="[^"]*"/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
    out[file.replace(/\.svg$/, '')] = xml;
  }
  return out;
}

const generic = load('generic');
const brands = load('brands');
const body =
  '/* Archivo generado por scripts/build-icons.js. No editar a mano. */\n' +
  '/* Licencias y atribución: assets/icons/LICENSES.md */\n' +
  `export const GENERIC_ICONS = ${JSON.stringify(generic, null, 1)};\n\n` +
  `export const BRAND_ICONS = ${JSON.stringify(brands, null, 1)};\n`;
fs.writeFileSync(path.join(root, 'index.js'), body);
console.log(`Iconos: ${Object.keys(generic).length} genéricos, ${Object.keys(brands).length} marcas`);
