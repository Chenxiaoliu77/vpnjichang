# Changelog

本文件记录 vpnjichang 的实质变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

## [0.2.0] - 2026-10-31

### Added

- **可达性巡检脚本** `scripts/check-links.mjs`：定期探测收录链接与备用入口，把结果写回 `data/links.json` 的 `probe` 字段。
  - 核心判定原则：**HTTP 403/503/429 + Cloudflare 人机校验标记 = 站点活着，只是脚本过不去**，不判为失效。本仓库 8 条中有 4 条稳定返回 403，若按「非 200 即失效」判定会导致巡检永久全红。
  - `health` 八档分类：`ok` / `cloudflare` / `redirected` / `blocked` / `server-error`（非致命）与 `notfound` / `timeout` / `unreachable`（致命）。
  - **漂移四级分级**：`alert`（域名变化或转为致命，判失败）/ `warn`（非致命状态互变，提示）/ `info`（状态码变化，可忽略）/ `notice`（首次巡检建基线）。巡检结果受出口 IP 影响，故只有 alert 级判失败，避免 CI 假红。
  - 命令：`--update`（写回）、`--check`（比对，CI 用）、`--json`、`--out`、`--only`、`--timeout`、`--concurrency`、`--retries`。
- **`probe` 字段**写入 `data/links.json` 与 `data/links.schema.json`：与人工核验的 `verified` 字段并存，一个记录「站点是什么」，一个记录「链接还能不能打开」。
- **定期巡检工作流** `.github/workflows/link-check.yml`：每周一、三、五 UTC 02:00 定时执行，也可手动触发；报告以 artifact 形式保留 30 天。**不自动写回仓库**——runner 出口 IP 与本地不同，自动写回会污染基线。
- **CI 新增第 4 步**（`.github/workflows/ci.yml`）：推送与 PR 时自动巡检收录链接。
- **README 渲染增强**：清单速览表新增「可达性」列；逐条说明新增「自动巡检」状态行（含备用入口各自的状态）。
- **校验器新增 probe 规则**（`scripts/validate-links.mjs`）：health 取值合法性、状态码与 health 自洽（`cloudflare` 只允许配 403/429/503）、`probe.backups` 条目数须等于 `backupUrls` 且地址必须是已声明的备用入口、致命状态须说明原因。

### Fixed

- `docs/structure.md`、`docs/link-formats.md`、`CONTRIBUTING.md` 中的代码块围栏与行内反引号被模板占位符污染，已全部还原为正确 Markdown。
- `scripts/render-readme.mjs` 的「最后更新」徽章改为由 `data/links.json` 的 `updatedAt` 渲染，保证幂等。

### Notes

- 首次巡检结果（2026-10-31）：11 个地址（8 个主链接 + 3 个备用入口）中，4 个主链接与 1 个备用入口为 Cloudflare 风控拦截，**0 个确认失效**。
- 更新基线务必在本地运行 `node scripts/check-links.mjs --update` 后再提交，不要在 CI runner 上自动写回。

## [0.1.0] - 2026-10-31

### Added

- **仓库初始化**：建立目录结构、README、文档、校验脚本与 CI。
- **收录清单**（`data/links.json`，共 8 条），每条含用途、参数说明、站点性质与核验记录：
  - mitce —— 联盟推广入口页（`affiliates.php`，需登录）。
  - 吹雪云 —— 客户端注册深链，`#@command:register?code=o31fm0TO`。
  - 超越网络 —— 客户端快速下单深链，`#@command:quick?code=kfSkUzXM`；站点当前品牌名为「顺畅网络」。
  - 赔钱机场 —— 服务端注册链接，`/register?code=ipPmzlHT&cover=sfw`。
  - 一分机场 —— 客户端注册深链，`#@command:register?code=07WGOzhp`。
  - 良心云 —— 客户端注册深链，`#@command:register?code=LMX0Y0MR`。
  - 飞鸟云 —— 客户端注册深链，`#@command:register?code=gKpZwtHV`；另收录防失联发布页 `https://github.com/feiniaoyun`。
  - 雪山 —— 客户端注册深链，`#@command:register?code=jLNcxk7c`；另收录备用站点 `https://2023.xue-shan.com/`。
- **链接形式说明**（`docs/link-formats.md`）：讲清 hash 深链与服务端推广链接在归因可靠性上的差异。
- **结构校验器** `scripts/validate-links.mjs`：零依赖，校验字段完整性、链接形式自洽性、id/URL 唯一性与推广码位置一致性。
- **渲染器** `scripts/render-readme.mjs`：由 `data/links.json` 生成 README 的清单表格与逐条说明，支持 `--check` 模式。
- **CI**（`.github/workflows/ci.yml`）：结构校验 + README 渲染一致性检查。

### Notes

- 8 条中有 4 条（吹雪云、一分机场、飞鸟云、雪山）部署 Cloudflare 人机校验，脚本直连返回 HTTP 403，需在浏览器中打开；其套餐与协议信息未经登录态核验，清单中已如实标注「未核验」，未做推测性描述。
- 「超越网络」条目对应的站点当前对外品牌为「顺畅网络」，已在正文标注这一名称差异。
