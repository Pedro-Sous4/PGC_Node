#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const uiDir = path.join(rootDir, 'apps', 'web', 'app');
const rulesPath = path.join(__dirname, 'ui-ptbr-rules.json');

function loadRules() {
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`Rules file not found: ${rulesPath}`);
  }

  const raw = fs.readFileSync(rulesPath, 'utf8');
  const parsed = JSON.parse(raw);

  const forbiddenTerms = (parsed.forbiddenTerms || [])
    .map((term) => String(term).trim())
    .filter(Boolean)
    .map((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i'));

  const allowedTexts = new Set(
    (parsed.allowedTexts || [])
      .map((text) => String(text).trim().toLowerCase())
      .filter(Boolean),
  );

  return { forbiddenTerms, allowedTexts };
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isPathLike(text) {
  return /^(\/|\.\/|\.\.\/|[a-z0-9_-]+(\/[a-z0-9_-]+)*)$/i.test(text);
}

function isLikelyUiText(text) {
  if (!text) return false;
  if (isPathLike(text)) return false;
  if (/^[{]/.test(text)) return false;
  if (/=>|\.map\(|\?\.|\{|\}/.test(text)) return false;

  const hasWhitespace = /\s/.test(text);
  const hasUppercase = /[A-Z]/.test(text);
  const hasAccent = /[\u00C0-\u017F]/.test(text);

  if (hasWhitespace || hasUppercase || hasAccent) return true;

  // Allow one-word checks for common labels like "Login" or "Reset"
  return /^[A-Za-z]{4,}$/.test(text);
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function lineFromIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function collectCandidates(content) {
  const candidates = [];

  // Visible text between JSX tags.
  const jsxTextRegex = />\s*([^<{\n][^<\n]*)\s*</g;
  let match = jsxTextRegex.exec(content);
  while (match) {
    const value = (match[1] || '').trim();
    if (value) {
      candidates.push({ value, index: match.index + 1 });
    }
    match = jsxTextRegex.exec(content);
  }

  // Selected JSX attribute values that are usually user-visible.
  const attrRegex = /\b(title|subtitle|placeholder|aria-label|alt)\s*=\s*"([^"]+)"/g;
  match = attrRegex.exec(content);
  while (match) {
    const value = (match[2] || '').trim();
    if (value) {
      candidates.push({ value, index: match.index });
    }
    match = attrRegex.exec(content);
  }

  return candidates;
}

function findViolations(filePath, rules) {
  const content = fs.readFileSync(filePath, 'utf8');
  const candidates = collectCandidates(content);
  const violations = [];

  for (const candidate of candidates) {
    const text = candidate.value.trim();
    if (!isLikelyUiText(text)) continue;
    const normalized = normalizeText(text);
    if (rules.allowedTexts.has(normalized)) continue;

    for (const term of rules.forbiddenTerms) {
      if (term.test(text)) {
        violations.push({
          filePath,
          line: lineFromIndex(content, candidate.index),
          text,
          term: term.toString(),
        });
        break;
      }
    }
  }

  return violations;
}

function main() {
  const rules = loadRules();

  if (!fs.existsSync(uiDir)) {
    console.log('UI directory not found, skipping check.');
    process.exit(0);
  }

  const files = walk(uiDir);
  const violations = [];

  for (const file of files) {
    violations.push(...findViolations(file, rules));
  }

  if (violations.length === 0) {
    console.log('UI pt-BR check passed.');
    process.exit(0);
  }

  console.error('UI pt-BR check failed. Found English terms in UI text:');
  for (const v of violations) {
    const relative = path.relative(rootDir, v.filePath).replace(/\\/g, '/');
    console.error(`- ${relative}:${v.line} -> "${v.text}"`);
  }

  process.exit(1);
}

main();
