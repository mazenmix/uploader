// Build deployable static assets without exposing readable source files in the Pages output.
// Server-side Cloudflare Pages Functions remain outside dist/ and are never obfuscated.
import { mkdir, readdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = process.cwd();
const source = path.resolve(root, process.argv[2] || '.');
const destination = path.resolve(root, 'dist');
if (source === destination || !source.startsWith(root)) throw new Error('Invalid source directory');
const excludedDirs = new Set(['.git', '.github', '.wrangler', 'node_modules', 'dist', 'functions', 'tools', 'cloudflare']);
const excludedFiles = new Set(['README.md', 'package.json', 'package-lock.json', 'wrangler.toml', 'supabase.sql', '.gitignore', '.deploy-trigger']);
let scripts = 0, styles = 0, copied = 0;

async function convert(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    const relative = path.relative(source, absolute);
    const output = path.join(destination, relative);
    if (item.isDirectory()) {
      if (!excludedDirs.has(item.name)) await convert(absolute);
      continue;
    }
    if (!item.isFile() || excludedFiles.has(item.name) || item.name.endsWith('.map')) continue;
    await mkdir(path.dirname(output), { recursive: true });
    if (/\.m?js$/i.test(item.name)) {
      const code = await readFile(absolute, 'utf8');
      const minified = await transform(code, {
        loader: 'js', target: 'es2020',
        minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
        legalComments: 'none', charset: 'utf8', sourcefile: relative
      });
      const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, {
        target: 'browser',
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        renameProperties: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.65,
        stringArrayShuffle: true,
        stringArrayRotate: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        selfDefending: false,
        sourceMap: false
      }).getObfuscatedCode();
      // Ensure the generated output is syntactically valid.
      await transform(obfuscated, { loader: 'js', target: 'es2020' });
      await writeFile(output, obfuscated, 'utf8');
      scripts++;
    } else if (/\.css$/i.test(item.name)) {
      const code = await readFile(absolute, 'utf8');
      const optimized = await transform(code, {
        loader: 'css', minify: true, legalComments: 'none',
        target: 'es2020', sourcefile: relative
      });
      await writeFile(output, optimized.code, 'utf8');
      styles++;
    } else {
      await copyFile(absolute, output);
      copied++;
    }
  }
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await convert(source);
console.log('Secure build complete:', JSON.stringify({ scripts, styles, copied, destination }));
