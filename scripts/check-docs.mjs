import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(entryPath);
    return extname(entry.name) === '.md' ? [entryPath] : [];
  });
}

const files = [resolve(projectRoot, 'README.md'), ...markdownFiles(resolve(projectRoot, 'Docs'))];
const unresolved = [];
const internalLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
const placeholderPattern = /\b(?:TODO|TBD|FIXME)\b|\[\s*(?:TODO|TBD|FIXME)\s*\]/i;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (placeholderPattern.test(source)) {
    unresolved.push(`${relative(projectRoot, file)} contains an unresolved placeholder marker`);
  }

  for (const match of source.matchAll(internalLinkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(rawTarget)) continue;

    const [targetPath] = rawTarget.split('#');
    if (!targetPath) continue;
    const target = resolve(file, '..', decodeURIComponent(targetPath));
    if (!existsSync(target)) {
      unresolved.push(`${relative(projectRoot, file)} links to missing ${targetPath}`);
    }
  }
}

if (unresolved.length > 0) {
  console.error('Documentation check failed:');
  for (const issue of unresolved) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed (${files.length} Markdown files scanned).`);
}
