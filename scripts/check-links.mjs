#!/usr/bin/env node
/**
 * check-links.mjs — 收录清单可达性巡检
 *
 * 定期检查 data/links.json 里每条收录链接（含备用入口）的可达性，区分「真失效」与
 * 「被风控拦截」，把结果写回链接记录的 probe 字段。
 *
 * 核心判定原则（改动本脚本时务必保留）：
 *   HTTP 403/503/429 + Cloudflare 人机校验标记  =>  站点活着，只是脚本过不去  =>  health=cloudflare
 *   HTTP 404/410/451 / DNS 解析失败 / 连接被拒 / 超时                          =>  真失效      =>  fatal
 * 机场站点普遍部署 Cloudflare。把 403 当成失效，是这类巡检最容易犯的错误。
 *
 * 用法：
 *   node scripts/check-links.mjs                # 巡检并打印报告，不写文件
 *   node scripts/check-links.mjs --update       # 巡检并把结果写回 data/links.json
 *   node scripts/check-links.mjs --check        # 巡检并与已存 probe 比对，有漂移则退出码 1
 *   node scripts/check-links.mjs --json         # 机器可读 JSON 输出
 *   node scripts/check-links.mjs --out r.json   # 报告写入文件（保证 JSON 始终合法）
 *   node scripts/check-links.mjs --only mitce   # 只巡检指定 id
 *
 * 参数：--timeout <ms>  --concurrency <n>  --retries <n>
 *
 * 退出码：0 = 无失效且无漂移；1 = 存在失效或漂移；2 = 参数或文件错误
 *
 * 零依赖：只用 Node 内置模块。巡检结果受出口 IP 影响——同一站点在不同 IP 上可能
 * 返回不同状态码，这是客观事实，不应被当成站点失效。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data', 'links.json');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, dflt) => {
  const i = argv.indexOf(f);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) return dflt;
  return v;
};

const MODE_UPDATE = has('--update');
const MODE_CHECK = has('--check');
const MODE_JSON = has('--json');
const ONLY = val('--only', null);
const OUT = val('--out', null);
const TIMEOUT_MS = Number(val('--timeout', 20000));
const CONCURRENCY = Number(val('--concurrency', 4));
const RETRIES = Number(val('--retries', 2));

if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS < 1000) {
  console.error('--timeout 至少 1000ms');
  process.exit(2);
}
if (!Number.isFinite(CONCURRENCY) || CONCURRENCY < 1) {
  console.error('--concurrency 至少为 1');
  process.exit(2);
}

// ---------- 常量 ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Cloudflare 人机校验 / 挑战页的响应体特征
const CF_MARKERS = [
  'just a moment',
  'cf-browser-verification',
  'challenge-platform',
  '__cf_chl',
  'checking your browser',
  'enable javascript and cookies to continue',
  'cf_chl_opt',
  'attention required! | cloudflare',
  'ray id'
];

// health 字典：fatal = 真失效（需要人工处理）
const HEALTH = {
  'ok':           { label: '正常',     fatal: false },
  'cloudflare':   { label: '风控拦截', fatal: false, needsBrowser: true },
  'redirected':   { label: '已跳转',   fatal: false },
  'blocked':      { label: '疑似封禁', fatal: false },
  'server-error': { label: '服务端错误', fatal: false },
  'notfound':     { label: '页面不存在', fatal: true },
  'timeout':      { label: '超时',     fatal: true },
  'unreachable':  { label: '无法连接', fatal: true }
};

// ---------- 工具 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dispWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      c === 0x2329 || c === 0x232a ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

const pad = (s, n) => {
  const t = String(s);
  return t + ' '.repeat(Math.max(0, n - dispWidth(t)));
};

const stripHash = (u) => {
  const i = u.indexOf('#');
  return i === -1 ? u : u.slice(0, i);
};

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
};

// ---------- 探测 ----------
async function probeOnce(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    let text = '';
    try {
      text = await res.text();
    } catch {
      text = '';
    }
    const lower = text.toLowerCase();
    const cf = CF_MARKERS.some((m) => lower.includes(m));
    return {
      ok: true,
      status: res.status,
      finalUrl: stripHash(res.url || url),
      redirected: res.redirected === true,
      cf,
      bytes: text.length
    };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function isRetryable(r) {
  if (!r.ok) {
    const e = r.error || {};
    const code = String((e.cause && e.cause.code) || e.code || '');
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
    return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR|EAI_AGAIN/i.test(code);
  }
  return r.status >= 500 || r.status === 429;
}

async function probeWithRetry(url) {
  let last = null;
  let used = 0;
  const max = Math.max(1, RETRIES + 1);
  for (let attempt = 1; attempt <= max; attempt++) {
    used = attempt;
    last = await probeOnce(url);
    if (attempt === max || !isRetryable(last)) break;
    await sleep(700 * attempt);
  }
  last.attempts = used;
  return last;
}

function classify(r) {
  if (!r.ok) {
    const e = r.error || {};
    const cause = String((e.cause && (e.cause.code || e.cause.message)) || e.code || '');
    if (e.name === 'TimeoutError' || e.name === 'AbortError' || /ETIMEDOUT|UND_ERR_(CONNECT|HEADERS)_TIMEOUT/i.test(cause)) {
      return { health: 'timeout', detail: '请求超时（' + TIMEOUT_MS + 'ms 内未响应）' };
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(cause)) {
      return { health: 'unreachable', detail: 'DNS 解析失败：' + cause };
    }
    if (/ECONNREFUSED/i.test(cause)) {
      return { health: 'unreachable', detail: '连接被拒绝：' + cause };
    }
    if (/ECONNRESET|EPIPE/i.test(cause)) {
      return { health: 'unreachable', detail: '连接中断：' + cause };
    }
    if (/CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(cause)) {
      return { health: 'unreachable', detail: 'TLS 证书校验失败：' + cause };
    }
    return { health: 'unreachable', detail: '请求失败：' + (e.message || String(e)) };
  }

  const s = r.status;
  if (r.cf && (s === 403 || s === 503 || s === 429)) {
    return {
      health: 'cloudflare',
      detail: 'HTTP ' + s + '，响应体含 Cloudflare 人机校验标记（脚本过不去，浏览器可正常打开）'
    };
  }
  if (s >= 200 && s < 300) return { health: 'ok', detail: 'HTTP ' + s + ' 正常响应' };
  if (s === 404 || s === 410) return { health: 'notfound', detail: 'HTTP ' + s + ' 页面不存在' };
  if (s === 451) return { health: 'notfound', detail: 'HTTP 451 因法律原因不可用' };
  if (s === 401 || s === 403) {
    return { health: 'blocked', detail: 'HTTP ' + s + ' 且无 Cloudflare 标记，可能为访问限制或地域封锁' };
  }
  if (s >= 500) return { health: 'server-error', detail: 'HTTP ' + s + ' 服务端错误' };
  if (s >= 300) return { health: 'redirected', detail: 'HTTP ' + s + ' 重定向未落到最终地址' };
  return { health: 'blocked', detail: 'HTTP ' + s + ' 非预期状态' };
}

// ---------- 并发池 ----------
async function pool(items, worker, limit) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------- 主流程 ----------
let doc;
try {
  doc = JSON.parse(readFileSync(DATA, 'utf8'));
} catch (e) {
  console.error('无法读取 ' + DATA + '：' + e.message);
  process.exit(2);
}

let targets = [];
for (const l of doc.links) {
  if (ONLY && l.id !== ONLY) continue;
  targets.push({ id: l.id, name: l.name, role: 'main', url: l.url, link: l });
  for (const b of l.backupUrls || []) {
    targets.push({ id: l.id, name: l.name, role: 'backup', url: b, link: l });
  }
}
if (targets.length === 0) {
  console.error('没有可巡检的链接' + (ONLY ? '（--only ' + ONLY + ' 未匹配到条目）' : ''));
  process.exit(2);
}

const raw = await pool(
  targets,
  async (t) => {
    const r = await probeWithRetry(t.url);
    const c = classify(r);
    const origHost = hostOf(t.url);
    const finalHost = hostOf(r.ok ? r.finalUrl : t.url);
    return {
      id: t.id,
      name: t.name,
      role: t.role,
      url: t.url,
      health: c.health,
      httpStatus: r.ok ? r.status : null,
      finalUrl: r.ok ? r.finalUrl : null,
      hostChanged: r.ok ? finalHost !== origHost : false,
      redirected: r.ok ? r.redirected === true : false,
      attempts: r.attempts,
      detail: c.detail
    };
  },
  CONCURRENCY
);

// 按条目聚合
const byLink = new Map();
for (const t of targets) {
  if (!byLink.has(t.id)) byLink.set(t.id, { id: t.id, name: t.name, mains: [], backups: [] });
  byLink.get(t.id)[t.role === 'main' ? 'mains' : 'backups'].push(t);
}
const results = raw.map((r, i) => {
  const t = targets[i];
  return { ...r, role: t.role };
});

// 漂移检测：与 links.json 里已存的 probe 比对
//
// 漂移分级（关键）：巡检结果受出口 IP 影响——同一站点在本地和 GitHub runner 上
// 可能一个返回 200、另一个被 Cloudflare 拦截。因此 health 的来回变化属于
// 「疑似」而非「确认」，不能直接判定为失效。
//   notice —— 首次巡检，无基线可比，仅作提示
//   info   —— 状态码变化但健康等级未变，可忽略
//   warn   —— 健康等级在两个非致命状态间变化（如 ok <-> cloudflare），疑似出口 IP 差异，需人工看一眼
//   alert  —— 最终地址域名变化，或健康等级变为致命 —— 这才是真正需要处理的
const DRIFT_SEVERITY = { notice: 0, info: 1, warn: 2, alert: 3 };

const drifts = [];
for (const l of doc.links) {
  if (ONLY && l.id !== ONLY) continue;
  const stored = l.probe;
  const mine = results.filter((r) => r.id === l.id);
  const main = mine.find((r) => r.role === 'main');
  if (!main) continue;

  if (!stored) {
    drifts.push({
      id: l.id, name: l.name, field: 'probe',
      from: '（无基线）', to: main.health,
      note: '首次巡检，已建立基线', severity: 'notice'
    });
    continue;
  }

  const storedFatal = stored.health && HEALTH[stored.health] ? HEALTH[stored.health].fatal : false;
  const mainFatal = HEALTH[main.health].fatal;

  // 域名变化 —— 最强信号，机场换域名后推广链接会直接失效
  if (stored.finalHost && main.finalUrl && stored.finalHost !== hostOf(main.finalUrl)) {
    drifts.push({
      id: l.id, name: l.name, field: 'finalHost',
      from: stored.finalHost, to: hostOf(main.finalUrl),
      note: '最终地址域名变化 —— 机场可能已换域名，请确认推广链接是否需要更新',
      severity: 'alert'
    });
  }

  // 健康等级变化
  if (stored.health !== main.health) {
    let severity;
    let note;
    if (mainFatal && !storedFatal) {
      severity = 'alert';
      note = '健康状态由 ' + stored.health + ' 变为致命状态 ' + main.health + '，需立即人工确认';
    } else if (storedFatal && !mainFatal) {
      severity = 'info';
      note = '健康状态由致命状态恢复为 ' + main.health + '（可能为出口 IP 差异）';
    } else {
      severity = 'warn';
      note = '健康状态变化 ' + stored.health + ' -> ' + main.health + '，疑似出口 IP 差异导致，请人工复核';
    }
    drifts.push({
      id: l.id, name: l.name, field: 'health',
      from: stored.health, to: main.health, note, severity
    });
  } else if (stored.httpStatus !== main.httpStatus) {
    drifts.push({
      id: l.id, name: l.name, field: 'httpStatus',
      from: String(stored.httpStatus), to: String(main.httpStatus),
      note: 'HTTP 状态码变化但健康等级未变', severity: 'info'
    });
  }
}

drifts.sort((a, b) => DRIFT_SEVERITY[b.severity] - DRIFT_SEVERITY[a.severity]);

const fatal = results.filter((r) => HEALTH[r.health].fatal);
const warned = results.filter((r) => !HEALTH[r.health].fatal && r.health !== 'ok');

const checkedAt = new Date().toISOString().slice(0, 10);

const report = {
  checkedAt,
  tool: 'check-links.mjs',
  totals: {
    targets: results.length,
    links: byLink.size,
    fatal: fatal.length,
    warning: warned.length,
    drift: drifts.length
  },
  results: results.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    url: r.url,
    health: r.health,
    label: HEALTH[r.health].label,
    fatal: HEALTH[r.health].fatal,
    httpStatus: r.httpStatus,
    finalUrl: r.finalUrl,
    hostChanged: r.hostChanged,
    attempts: r.attempts,
    detail: r.detail
  })),
  drifts
};

// ---------- 输出 ----------
const jsonText = JSON.stringify(report, null, 2);
if (OUT) {
  try {
    writeFileSync(OUT, jsonText + '\n', 'utf8');
  } catch (e) {
    console.error('无法写入 ' + OUT + '：' + e.message);
  }
}

if (MODE_JSON) {
  console.log(jsonText);
} else {
  console.log('');
  console.log('可达性巡检  ' + checkedAt + '  （' + results.length + ' 个地址 / ' + byLink.size + ' 个条目）');
  console.log('');
  for (const r of results) {
    const meta = HEALTH[r.health];
    const mark = meta.fatal ? 'x' : (r.health === 'ok' ? '+' : '!');
    const extra = r.hostChanged ? '  << 域名已变化' : '';
    console.log(
      '  ' + mark + ' ' + pad(r.name, 14) + pad(r.role, 8) + pad(meta.label, 12) +
      pad(r.httpStatus === null ? '-' : String(r.httpStatus), 5) + r.detail + extra
    );
  }
  if (drifts.length) {
    console.log('');
    console.log('与已存记录相比的变化：');
    const SEV_MARK = { alert: 'x', warn: '!', info: '-', notice: '.' };
    for (const d of drifts) {
      console.log(
        '  ' + SEV_MARK[d.severity] + ' [' + pad(d.severity, 7) + '] ' + pad(d.name, 14) + pad(d.field, 14) +
        d.from + '  ->  ' + d.to + '   (' + d.note + ')'
      );
    }
  }
  console.log('');
  console.log(
    '失效 ' + fatal.length + ' · 需留意 ' + warned.length + ' · 变化 ' + drifts.length +
    '   （403+Cloudflare 记为风控拦截，不算失效）'
  );
}

// ---------- 写回 ----------
if (MODE_UPDATE) {
  let changed = false;
  for (const l of doc.links) {
    if (ONLY && l.id !== ONLY) continue;
    const mine = results.filter((r) => r.id === l.id);
    const main = mine.find((r) => r.role === 'main');
    if (!main) continue;
    const backups = mine
      .filter((r) => r.role === 'backup')
      .map((r) => ({
        url: r.url,
        health: r.health,
        httpStatus: r.httpStatus,
        finalUrl: r.finalUrl,
        hostChanged: r.hostChanged
      }));
    const next = {
      checkedAt,
      health: main.health,
      httpStatus: main.httpStatus,
      finalUrl: main.finalUrl,
      finalHost: hostOf(main.finalUrl || ''),
      hostChanged: main.hostChanged,
      detail: main.detail,
      backups
    };
    const prev = l.probe;
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) changed = true;
    l.probe = next;
  }
  if (changed) {
    doc.updatedAt = checkedAt;
    writeFileSync(DATA, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log('');
    console.log('已写回 ' + DATA + '（updatedAt = ' + checkedAt + '），请重新渲染 README。');
  } else {
    console.log('');
    console.log('巡检结果与已存记录一致，未写回。');
  }
}

// ---------- 退出码 ----------
// 只有「确认失效」和「域名变化」才算失败。其余漂移多半来自出口 IP 差异，
// 若一并判失败，CI 会在每次 runner 换 IP 时假红。
const alerts = drifts.filter((d) => d.severity === 'alert');
const warns = drifts.filter((d) => d.severity === 'warn');

if (fatal.length) {
  if (!MODE_JSON) {
    console.log('');
    console.log('有 ' + fatal.length + ' 个地址确认失效，需要人工处理。');
  }
  process.exit(1);
}
if (MODE_CHECK && alerts.length) {
  if (!MODE_JSON) {
    console.log('');
    console.log('有 ' + alerts.length + ' 处告警级变化（域名变化或转为致命状态），需要复核。');
  }
  process.exit(1);
}
if (MODE_CHECK && warns.length) {
  if (!MODE_JSON) {
    console.log('');
    console.log('另有 ' + warns.length + ' 处疑似出口 IP 差异导致的警告，已忽略（不判失败）。');
  }
}
process.exit(0);
