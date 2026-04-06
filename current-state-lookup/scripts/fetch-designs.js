#!/usr/bin/env node
/**
 * fetch-designs.js
 * 从 GitHub 设计仓库拉取文档，按需求描述关键词检索相关内容
 *
 * Usage:
 *   node fetch-designs.js "<需求描述>" <output-dir> [--repo <owner/repo>]
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── CLI 参数解析 ──────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node fetch-designs.js "<需求描述>" <output-dir> [--repo <owner/repo>]');
  process.exit(1);
}

const query = args[0];
const outputDir = path.resolve(args[1]);

let repo = 'w00victoria82-del/co-designs';
const repoIdx = args.indexOf('--repo');
if (repoIdx !== -1 && args[repoIdx + 1]) {
  repo = args[repoIdx + 1];
}

// ── 工具函数 ──────────────────────────────────────────────────
function log(msg) { console.error(`[fetch-designs] ${msg}`); }

function extractKeywords(text) {
  const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '对', '后', '时', '中', '为', '以', '及', '与', '或', '等', '该', '其', '将', '可', '已', '并', '由', '从', '被', '向', '按', '如', '若', '当', '则', '且', '但', '而', '所', '此', '该']);

  // 先按标点/空格切分得到粗粒度词
  const coarseTokens = text
    .replace(/[，。！？、；：""''【】《》()\s\-_/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !stopWords.has(t));

  // 对每个粗粒度词再做2-gram和3-gram切分，覆盖更多匹配
  const keywords = new Set(coarseTokens);
  for (const token of coarseTokens) {
    if (token.length >= 4) {
      // 滑动窗口切2字词和3字词
      for (let i = 0; i <= token.length - 2; i++) {
        const bi = token.slice(i, i + 2);
        if (!stopWords.has(bi)) keywords.add(bi);
      }
      for (let i = 0; i <= token.length - 3; i++) {
        const tri = token.slice(i, i + 3);
        if (!stopWords.has(tri)) keywords.add(tri);
      }
    }
  }
  return [...keywords];
}

function scoreSection(sectionText, keywords) {
  let score = 0;
  for (const kw of keywords) {
    const regex = new RegExp(kw, 'gi');
    const matches = sectionText.match(regex);
    if (matches) score += matches.length;
  }
  return score;
}

// ── Step 1: 克隆或更新仓库 ────────────────────────────────────
const cacheDir = path.join(os.homedir(), '.claude', 'design-repo-cache', repo.replace('/', '_'));

if (!fs.existsSync(cacheDir)) {
  log(`克隆仓库 ${repo} ...`);
  fs.mkdirSync(cacheDir, { recursive: true });
  const result = spawnSync('gh', ['repo', 'clone', repo, cacheDir, '--', '--depth=1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
} else {
  log(`更新仓库缓存 ${repo} ...`);
  spawnSync('git', ['-C', cacheDir, 'pull', '--ff-only'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

// ── Step 2: 收集所有 .md 文件 ─────────────────────────────────
function collectMdFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectMdFiles(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

const mdFiles = collectMdFiles(cacheDir);
log(`找到 ${mdFiles.length} 个 .md 文件`);

// ── Step 3: 关键词提取 ────────────────────────────────────────
const keywords = extractKeywords(query);
log(`关键词: ${keywords.join(', ')}`);

// ── Step 4: 按章节切分并评分 ──────────────────────────────────
const MIN_SCORE = 1;

const matchedSections = [];

for (const filePath of mdFiles) {
  const relPath = path.relative(cacheDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  // 按 # 标题切分
  const lines = content.split('\n');
  const sections = [];
  let current = { title: relPath, lines: [] };

  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      if (current.lines.length > 0) sections.push(current);
      current = { title: line.replace(/^#+\s*/, '').trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) sections.push(current);

  for (const sec of sections) {
    const text = sec.lines.join('\n');
    const score = scoreSection(text, keywords);
    if (score >= MIN_SCORE) {
      matchedSections.push({ file: relPath, title: sec.title, text, score });
    }
  }
}

// 按分数排序，取前20个
matchedSections.sort((a, b) => b.score - a.score);
const top = matchedSections.slice(0, 20);

log(`匹配到 ${matchedSections.length} 个相关段落，取前 ${top.length} 个`);

// ── Step 5: 写输出 ────────────────────────────────────────────
fs.mkdirSync(outputDir, { recursive: true });

// matched.md
const matchedMd = top.map(s =>
  `<!-- 来源: ${s.file} | 相关度: ${s.score} -->\n## ${s.title}\n\n${s.text}`
).join('\n\n---\n\n');

fs.writeFileSync(path.join(outputDir, 'matched.md'), matchedMd, 'utf8');

// summary.json
const summary = {
  query,
  keywords,
  repo,
  totalFiles: mdFiles.length,
  totalMatched: matchedSections.length,
  topSections: top.map(s => ({ file: s.file, title: s.title, score: s.score }))
};
fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

log(`输出已写入: ${outputDir}`);
console.log(JSON.stringify(summary, null, 2));
