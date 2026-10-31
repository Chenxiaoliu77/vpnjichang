#!/usr/bin/env node
/**
 * validate-links.mjs — 校验 data/links.json 的结构与自洽性。
 *
 * 零依赖：只用 Node 内置模块。校验通过退出码 0，失败退出码 1。
 * 用法：node scripts/validate-links.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data', 'links.json');

const errors = [];
const warns = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

let raw;
try {
  raw = readFileSync(DATA, 'utf8');
} catch (e) {
  console.error('无法读取 ' + DATA + '：' + e.message);
  process.exit(1);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  console.error('data/links.json 不是合法 JSON：' + e.message);
  process.exit(1);
}

if (typeof doc.version !== 'number' || doc.version < 1) fail('version 必须为 >= 1 的整数');
if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.updatedAt || '')) fail('updatedAt 必须为 YYYY-MM-DD');
if (!Array.isArray(doc.links) || doc.links.length === 0) fail('links 必须为非空数组');

const CATEGORIES = ['provider', 'affiliate', 'mirror', 'tool', 'tutorial'];
const URL_KINDS = ['hash-deep-link', 'path-referral', 'path-page', 'plain'];

const seenIds = new Set();
const seenUrls = new Set();

doc.links.forEach((l, i) => {
  const at = 'links[' + i + '] (' + (l.id || l.name || '?') + ')';

  if (!l.id || !/^[a-z0-9-]+$/.test(l.id)) fail(at + '：id 缺失或非法（小写字母/数字/连字符）');
  if (seenIds.has(l.id)) fail(at + '：id 重复');
  seenIds.add(l.id);

  if (!l.name) fail(at + '：缺少 name');
  if (!CATEGORIES.includes(l.category)) fail(at + '：category 必须是 ' + CATEGORIES.join('/'));
  if (!URL_KINDS.includes(l.urlKind)) fail(at + '：urlKind 必须是 ' + URL_KINDS.join('/'));

  if (typeof l.url !== 'string' || !l.url.startsWith('https://')) {
    fail(at + '：url 必须以 https:// 开头');
  } else {
    if (seenUrls.has(l.url)) fail(at + '：url 重复');
    seenUrls.add(l.url);
    let u = null;
    try { u = new URL(l.url); } catch { fail(at + '：url 不是合法 URL'); }
    if (u) {
      if (l.urlKind === 'hash-deep-link') {
        if (!u.hash.startsWith('#@command:')) fail(at + '：hash-deep-link 的 fragment 必须以 #@command: 开头，实际为 "' + u.hash + '"');
        // 形式：#@command:<命令名>?<参数>   例：#@command:register?code=o31fm0TO
        const payload = u.hash.slice('#@command:'.length);
        const qIdx = payload.indexOf('?');
        const cmd = qIdx === -1 ? payload : payload.slice(0, qIdx);
        if (!cmd) fail(at + '：hash 中缺少 command 名（#@command: 与 ? 之间为空）');
        if (!/^[a-z][a-z0-9-]*$/i.test(cmd)) fail(at + '：command 名非法：' + cmd);
        if (qIdx !== -1) {
          const params = new URLSearchParams(payload.slice(qIdx + 1));
          if (!params.has('code')) fail(at + '：hash 的参数中缺少 code');
        }
        if (l.referralCode && !u.hash.includes('code=' + l.referralCode)) fail(at + '：hash 中未包含 referralCode ' + l.referralCode);
        if (l.referralCode && u.searchParams.has('code')) fail(at + '：hash-deep-link 的推广码不应同时出现在 query 中');
      }
      if (l.urlKind === 'path-referral') {
        if (u.hash) fail(at + '：path-referral 不应带 fragment');
        if (l.referralCode && u.searchParams.get('code') !== l.referralCode) fail(at + '：query 的 code 与 referralCode 不一致');
        if (l.cover && u.searchParams.get('cover') !== l.cover) fail(at + '：query 的 cover 与 cover 字段不一致');
      }
      if ((l.urlKind === 'path-page' || l.urlKind === 'plain') && (u.searchParams.has('code') || u.searchParams.has('cover'))) {
        fail(at + '：' + l.urlKind + ' 不应携带 code/cover 推广参数');
      }
    }
  }

  if (l.urlKind === 'hash-deep-link' && !l.referralCode) fail(at + '：hash-deep-link 缺少 referralCode');
  if (l.urlKind === 'path-referral' && !l.referralCode) fail(at + '：path-referral 缺少 referralCode');
  if (l.category === 'affiliate' && l.referralCode) fail(at + '：affiliate 类条目不应有 referralCode');

  if (l.punycodeDomain && l.unicodeDomain && l.punycodeDomain === l.unicodeDomain) {
    fail(at + '：punycodeDomain 与 unicodeDomain 不应相同（需为 Punycode ↔ Unicode 对照）');
  }

  if (!l.purpose || l.purpose.length < 8) fail(at + '：purpose 缺失或过短');
  if (!Array.isArray(l.description) || l.description.length === 0) fail(at + '：description 必须为非空数组');
  if (!Array.isArray(l.tags) || l.tags.length === 0) fail(at + '：tags 必须为非空数组');
  for (const k of ['pricing', 'platforms', 'protocols', 'backupUrls', 'contact']) {
    if (!Array.isArray(l[k])) fail(at + '：' + k + ' 必须为数组');
  }

  const v = l.verified;
  if (!v || typeof v !== 'object') {
    fail(at + '：缺少 verified 记录');
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checkedAt || '')) fail(at + '：verified.checkedAt 必须是 YYYY-MM-DD');
    if (!Number.isInteger(v.httpStatus) || v.httpStatus < 100 || v.httpStatus > 599) fail(at + '：verified.httpStatus 非法');
    if (!v.method) fail(at + '：verified.method 缺失');
    if (!v.note) fail(at + '：verified.note 缺失');
    if (v.httpStatus === 403 && !/Cloudflare|风控/i.test(v.note)) {
      warn(at + '：httpStatus 403 但 note 未说明被风控拦截的原因');
    }
  }

  for (const b of l.backupUrls) {
    if (b === l.url) fail(at + '：backupUrls 与主链接重复');
  }
});

console.log('校验 ' + doc.links.length + ' 条收录项（data/links.json）');
if (warns.length) {
  console.log('');
  console.log('警告 ' + warns.length + ' 条：');
  for (const w of warns) console.log('  ! ' + w);
}
if (errors.length) {
  console.error('');
  console.error('错误 ' + errors.length + ' 条：');
  for (const e of errors) console.error('  x ' + e);
  process.exit(1);
}
console.log('');
console.log('全部通过。');
