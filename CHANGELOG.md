# Changelog

本文件记录 vpnjichang 的实质变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

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
