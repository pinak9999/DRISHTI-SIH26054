// Usage (from repo root):  node check-css-classes.mjs
// Lists CSS classes used in TSX but NOT defined in any CSS file (likely lost in merge resolution).
import fs from 'fs'; import path from 'path';
const root = 'frontend/src';
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e => e.isDirectory()? walk(path.join(d,e.name)) : [path.join(d,e.name)]);
const files = walk(root);
const css = files.filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
const defined = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]));
const used = new Map();
for (const f of files.filter(f=>/\.tsx$/.test(f))) {
  const src = fs.readFileSync(f,'utf8');
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const s = (m[1]||m[2]||m[3]||'').replace(/\$\{[^}]*\}/g,' ');
    for (const c of s.split(/\s+/).filter(Boolean)) if(!used.has(c)) used.set(c,new Set()), used.get(c).add(path.basename(f)); else used.get(c).add(path.basename(f));
  }
}
const missing = [...used].filter(([c])=>!defined.has(c));
console.log(`Classes used in TSX: ${used.size}, defined in CSS: ${defined.size}, MISSING: ${missing.length}`);
for (const [c,fs_] of missing.sort()) console.log(`  .${c}  <- ${[...fs_].join(', ')}`);
