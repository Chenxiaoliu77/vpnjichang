# 链接形式规范

这份文档说明 vpnjichang 收录链接的四种形式，以及各形式下**推广码放在哪里、服务器能不能看见、归因是否可靠**。新增条目前先读这一页。

## 为什么链接形式重要

同一条机场推广链接，参数位置不同，**统计结果可能完全不同**：

| 形式 | 推广码位置 | 服务器可见 | 归因可靠性 | 失败模式 |
| --- | --- | --- | --- | --- |
| 客户端深链 | @@BT@@#@command:<cmd>?code=...@@BT@@ | **否** | 弱（依赖前端解析） | 前端变更即静默丢码 |
| 服务端推广链接 | @@BT@@?code=...&cover=...@@BT@@ | **是** | 强（服务端记录） | 参数进日志与 Referer |
| 站内页面 | 无 | — | 不适用 | 需登录才可见 |
| 普通链接 | 无 | — | 不适用 | — |

## 形式一：客户端深链（hash-deep-link）

### 形态

@@BT@@
https://<host>/#@command:<command>?<params>
@@BT@@

- @@BT@@#@command:@@BT@@ —— 固定前缀，标识这是给客户端读的深链；
- @@BT@@<command>@@BT@@ —— 命令名，常见 @@BT@@register@@BT@@（注册）、@@BT@@quick@@BT@@（快速下单）、@@BT@@login@@BT@@、@@BT@@subscribe@@BT@@；
- @@BT@@?<params>@@BT@@ —— 参数串，推广码固定叫 @@BT@@code@@BT@@。

实例（本仓库收录的真实形式）：

@@BT@@
https://xn--9kqs1lo79d.com/#@command:register?code=o31fm0TO      # 吹雪云：注册
https://scgdzyy.scl168.club/#@command:quick?code=kfSkUzXM         # 超越网络：快速下单
https://xn--4gqx1hgtfdmt.com/#@command:register?code=07WGOzhp   # 一分机场：注册
https://xn--9kqz23b19z.com/#@command:register?code=LMX0Y0MR     # 良心云：注册
https://a1.170809.xyz/#@command:register?code=gKpZwtHV          # 飞鸟云：注册
https://xueshan.shop/#@command:register?code=jLNcxk7c            # 雪山：注册
@@BT@@

### fragment 为什么服务器看不见

按 HTTP 规范（RFC 3986 §3.5），URL 的 **fragment（片段）** 是**纯客户端**部分：客户端向服务器发请求时会把它整个去掉，服务器只收到 @@BT@@https://xn--9kqs1lo79d.com/@@BT@@。

所以深链的实际流程是：

@@BT@@
浏览器打开 URL
  → 服务器收到裸域名（拿不到推广码）
  → 页面 JS 读取 location.hash，解析出 command 与 code
  → JS 跳转/填表，把 code 带给注册接口
@@BT@@

### 归因风险

推广码的最终提交由**前端代码**完成。因此：

- 目标站点改版、JS 报错、用户装了广告拦截器 → 码会**静默丢失**；
- 用户此时注册仍然成功，但**佣金不会归到你头上**；
- 服务端完全看不到这次点击，**无法事后补归因**。

**实践建议**：把深链当作「体验优化」，不要当作「唯一归因手段」；若某机场同时提供服务端推广链接，优先用后者。

## 形式二：服务端推广链接（path-referral）

### 形态

@@BT@@
https://<host>/<path>?code=<推广码>&cover=<渠道标记>
@@BT@@

实例：

@@BT@@
https://xn--mes358aby2apfg.com/register?code=ipPmzlHT&cover=sfw   # 赔钱机场
@@BT@@

### 参数含义

- **@@BT@@code@@BT@@** —— 推广/邀请码。服务器收到并写入邀请关系，**归因可靠**。
- **@@BT@@cover@@BT@@** —— 渠道 / 落地页来源标记。本例中 @@BT@@sfw@@BT@@ 是所选渠道的缩写，用于按推广位拆分转化率与结算金额。同一个推广码配不同 @@BT@@cover@@BT@@，就能区分「站内横幅」和「社交媒体」等来源。

### 代价

- URL 更长；
- 参数会出现在服务器访问日志、CDN 日志、浏览器历史与可能外传的 @@BT@@Referer@@BT@@ 头里。

## 形式三：站内页面（path-page）

实例：

@@BT@@
https://mitce.io/affiliates.php
@@BT@@

这是**联盟推广后台入口**，不是用户下单页。它通常位于登录保护范围内：未登录访问会被重定向到登录页，只有登录后的推广者才能看到自己的推广链接、佣金比例与结算记录。

**收录规则**：@@BT@@path-page@@BT@@ 类**不得**携带 @@BT@@code@@BT@@ / @@BT@@cover@@BT@@ 参数（校验器会拦）。

## 形式四：普通链接（plain）

不带任何推广参数的公开地址，通常用作备用入口、状态页或教程页。

## 收录时怎么选

@@BT@@
拿到一条推广地址
  │
  ├─ 带 #@command:xxx?code=...  →  hash-deep-link
  │     → referralCode = code 的值
  │     → cover = null
  │
  ├─ 带 ?code=...（或 ?code=...&cover=...）  →  path-referral
  │     → referralCode = code 的值
  │     → cover = cover 的值（没有则 null）
  │
  └─ 没有任何推广参数
        ├─ 是联盟/后台/教程页  →  path-page
        └─ 是普通外链          →  plain
@@BT@@

## 填写清单

- [ ] @@BT@@urlKind@@BT@@ 与 URL 实际形态一致
- [ ] @@BT@@referralCode@@BT@@ 与 URL 中的 @@BT@@code@@BT@@ 完全一致（深链在 hash 里，服务端链接在 query 里）
- [ ] @@BT@@cover@@BT@@ 仅在 @@BT@@path-referral@@BT@@ 时填写，且与 URL 中的 @@BT@@cover@@BT@@ 一致
- [ ] @@BT@@url@@BT@@ 中推广码**没有**被重复写在两个位置
- [ ] @@BT@@description@@BT@@ 里说清推广码是靠什么带过去的（前端解析 / 服务端接收）
- [ ] @@BT@@verified@@BT@@ 记录了实测状态码与最终 URL
- [ ] 若站点有 Cloudflare 防护，在 @@BT@@verified.note@@BT@@ 里写明「脚本直连 403，需浏览器打开」

## Punycode 域名

机场常用中文品牌名做域名，走 IDN（Punycode）编码：

| Punycode | Unicode |
| --- | --- |
| @@BT@@xn--9kqs1lo79d.com@@BT@@ | 吹雪云.com |
| @@BT@@xn--mes358aby2apfg.com@@BT@@ | 赔钱机场.com |
| @@BT@@xn--4gqx1hgtfdmt.com@@BT@@ | 一分机场.com |
| @@BT@@xn--9kqz23b19z.com@@BT@@ | 良心云.com |

收录时**两个字段都要填**：@@BT@@punycodeDomain@@BT@@ 用 ASCII 形式（放进 URL），@@BT@@unicodeDomain@@BT@@ 用人类可读形式。校验器要求两者**不得相同**，以防把同一个字符串填两遍冒充对照。
