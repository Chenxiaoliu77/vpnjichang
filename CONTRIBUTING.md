# 贡献指南

感谢维护这份清单。这个仓库的数据真源是 `data/links.json`，README 的清单区块由脚本渲染——**请不要直接改 README 里的清单表格和逐条说明**，改了会被覆盖。

## 环境要求

只需要 Node.js ≥ 18。不需要 `npm install`，仓库无第三方依赖。

## 流程

### 1. 准备

@@BT@@
git clone https://github.com/Chenxiaoliu77/vpnjichang.git
cd vpnjichang
git checkout -b feat/add-<名称>
@@BT@@

### 2. 在 `data/links.json` 里追加记录

按 `data/links.schema.json` 填全字段。要点：

- `id`：小写字母/数字/连字符，全局唯一；
- `urlKind` 必须与 URL 实际形态匹配（深链 / 服务端推广链接 / 站内页 / 普通链接）；
- `referralCode` 与 `cover` 的值必须与 URL 里的一字不差；
- `description` 写清：站点性质、链接参数含义、注意事项；
- `pricing` 只填**页面上真实公示**的套餐；
- `verified` 记录实测状态码与最终 URL；**未核验的项要在 `note` 里写明**。

链接形式怎么选，见 [`docs/link-formats.md`](docs/link-formats.md)。

### 3. 本地校验

@@BT@@
node scripts/validate-links.mjs         # 结构与自洽性校验
node scripts/render-readme.mjs          # 重新渲染 README 清单区块
node scripts/render-readme.mjs --check   # 确认已一致
@@BT@@

### 4. 提交

@@BT@@
git add data/links.json README.md
git commit -m "feat(links): 新增 <名称> 收录条目"
git push origin feat/add-<名称>
@@BT@@

然后开 PR。CI 会自动跑校验与渲染一致性检查。

### 5. 合并后

在 `CHANGELOG.md` 的 `[Unreleased]` 段追加一条记录。

## 更新已有条目

- **站点改了域名/链接**：更新 `url`、`urlKind`、`referralCode`、`cover`，并刷新 `verified`。
- **站点改了套餐**：更新 `pricing`，并刷新 `verified.checkedAt`。
- **站点没了**：把该条**移除**（不要只标「已失效」——失效条目是噪音），并在 CHANGELOG 记录移除原因。

## 核验方法建议

1. 先用脚本请求，看 HTTP 状态码；
2. 拿到 403 且页面含 `Just a moment...`，说明撞上了 Cloudflare 人机校验——换渲染型抓取或浏览器打开，**不要**因此判定站点失效；
3. 记录最终 URL（重定向后的真实地址）；
4. `method` 字段写清用了什么方式，例如 `curl + read_page`。

## 原则

- **不推测**。没验证到的信息就写「未核验」，不要用常识补全价格、协议或节点数。
- **如实标注可达性**。403 与 200 都是合法结果，区别在于读者怎么用它。
- **只收录公开推广入口**。不要提交任何账号、订阅链接、节点配置或付费凭证。
- **保留来源**。Punycode 域名要同时记 ASCII 与 Unicode 两种形式。

## 联系

问题与建议请开 issue，或直接联系仓库维护者。
