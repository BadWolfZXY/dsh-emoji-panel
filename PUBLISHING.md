# 上架 DSH 插件市场

两条路，建议都做：

| 路线 | 别人怎么装 | 生效时间 | 你控制 |
| --- | --- | --- | --- |
| **A. 社区精选 `awesome-dsh-plugin`** | 插件 → 发现 → 搜「表情面板」 | 合并后站点/市场每天刷新 | 提 PR，等审 |
| **B. 自建索引源** | 插件 → 发现 → 添加索引源 → 你的 index.json URL | 立刻 | 100% |

两者都要求**先把包发到 npm**（或者仓库能被 `dsh plugin add git+…` 装）。DSH 只认索引，没有「官方上架」这回事——任何 https 静态 JSON 都能被加为索引源([官方说明](https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market))。

---

## 0. 需要你本人的东西

| 需要 | 用途 |
| --- | --- |
| npm 账号（`npm login`） | 发布 `dsh-emoji-panel`（已查：npm 上没被占用） |
| GitHub 账号 + 公开仓库 | 索引和 PR 要链源码，评审也看源码 |

本文件里 `BadWolfZXY` 是按你本机 git 配置填的，仓库地址、作者名要改成实际值。

---

## 1. 包已经改好，可直接发

> **当前状态（2026-11-18）**：已切成发布身份，`npm pack --dry-run` 通过（9 个文件 / 20 KB）。
> 四处身份保持一致 —— `package.json` `name` = `client.js` 注册 id = `STYLE_OWNER` = `cordis.patch.yml` 的 `name`，都是 `dsh-emoji-panel`。
> 模块注册 id 必须等于包名（= loader entry 名），否则报 `loaded without registering`。

已具备：`private: false`、`license: MIT` + LICENSE、`author`、`repository`/`homepage`/`bugs`、`keywords`（含 `dsh-plugin`）、`engines.dsh`、`publishConfig.access: public`、`files`、`dsh.bundle` + `dsh.client`、`screenshots.json` + `screenshots/`。

**唯一要确认的**：`repository` 里的 `BadWolfZXY` 是你真实的 GitHub 用户名；不对就全局替换。

**本机那份要重装**（包名从 `@local/dsh-emoji-panel` 改成 `dsh-emoji-panel`，旧条目加载不到）：

```powershell
dsh plugin --profile desktop remove @local/dsh-emoji-panel
dsh plugin --profile desktop add "E:\Private Projects\AI\DSH\emoji-panel"   # 或发布后 add dsh-emoji-panel
```

## 2. 本地自检

```powershell
cd "E:\Private Projects\AI\DSH\emoji-panel"
npm pack --dry-run          # 看打进去哪些文件，别多也别少
npm publish --dry-run       # 看有没有会被拒的地方
```

期望的打包内容：`index.js`、`client.js`、`cordis.patch.yml`、`README.md`、`LICENSE`、`locale/zh.json`、`locale/en.json`、`icon.svg`、`package.json`。`screenshots/` 只给 GitHub 用，不进 npm。

## 3. 发 npm

```powershell
npm login
npm publish                 # 发 1.0.0
```

发完自检：

```powershell
npm view dsh-emoji-panel version
```

## 4. 建 GitHub 仓库

```powershell
cd "E:\Private Projects\AI\DSH\emoji-panel"
git init -b main
git add -A
git commit -m "feat: dsh-emoji-panel 1.0.0"
# 在 GitHub 建空仓库 dsh-emoji-panel 后：
git remote add origin git@github.com:BadWolfZXY/dsh-emoji-panel.git
git push -u origin main
```

然后在仓库页点一下 **Topics → 加 `dsh-plugin`**（社区收录的硬性要求）。

仓库根目录已经放了 `screenshots.json`（2 张相对路径）+ `screenshots/`：

```json
["screenshots/panel.png", "screenshots/composer.png"]
```

**时间门槛**：仓库创建要满 1 天才能过 CI 的 `MIN_AGE_DAYS`，今天建仓、明天再提 PR。

## 5. 提收录 PR（路线 A）

投稿仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>

规则（来自该仓库 `contributing.md` / PR 模板 / CI）：

- 一个 PR **只加一个文件**：`data/plugins/<owner>__<repo>.yml`
- 一个 PR **最多 3 条**，且只能改自己那一条
- `package.json` 必须声明 `dsh.bundle`（✅ 已有）
- 仓库要有真实可用代码、打了 `dsh-plugin` topic、创建满 1 天
- `category` 取固定清单里的值 —— 我们用 `ui`
- 描述只讲功能、不带营销词，必须与代码相符
- 两个 README 由脚本生成，**不要手改**

文件内容（`data/plugins/BadWolfZXY__dsh-emoji-panel.yml`）：

```yaml
url: https://github.com/BadWolfZXY/dsh-emoji-panel
name: BadWolfZXY/dsh-emoji-panel
category: ui
description:
  en: 'Emoji picker in the DSH composer: category tabs and a permanent search box over 200 Unicode emoji, a Recent tab, and a Mine tab that imports local images or image URLs with a one-line meaning. Picking inserts at the caret, closes the panel and returns focus to the composer; imported memes insert "[meme: meaning]" so the model reads what the meme means.'
  zh: 'DSH 输入框里的表情面板：分类标签 + 常驻搜索框，200 多个 Unicode emoji，另有「最近」和「自定义」两个标签——自定义可导入本地图片或图片网址，导入时写一句含义。点选即插到光标处、自动收起并把焦点还给输入框；导入的表情插入 `[表情: 含义]`，模型据此理解表情意思。'
icon: https://raw.githubusercontent.com/BadWolfZXY/dsh-emoji-panel/main/icon.svg
```

## 6. 自建索引（路线 B，立刻可用）

把 `index.json` 和 `icon.svg` 放到 GitHub Pages / jsDelivr / 任意 https 静态主机。格式（官方 `format: 1`）：

```json
{
  "format": 1,
  "title": { "en": "dsh-emoji-panel", "zh": "表情面板" },
  "plugins": [
    {
      "name": "dsh-emoji-panel",
      "title": { "en": "Emoji panel", "zh": "表情面板" },
      "description": {
        "en": "Emoji picker in the composer with recents and a custom meme library.",
        "zh": "输入框表情面板，带最近使用和自定义表情库。"
      },
      "icon": "icon.svg",
      "author": "BadWolfZXY",
      "homepage": "https://github.com/BadWolfZXY/dsh-emoji-panel#readme",
      "repository": { "url": "https://github.com/BadWolfZXY/dsh-emoji-panel" },
      "metadata": { "category": "ui" },
      "versions": [
        {
          "version": "1.0.0",
          "publishTimestamp": 1795000000,
          "source": { "type": "npm" },
          "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0" }
        }
      ]
    }
  ]
}
```

硬性要求：

- 文本字段是「字符串」或「以小写语言 id 为键的对象，且**必须含 `en`**」
- `icon` 可以是相对路径（相对 index.json 解析）、`https:` 绝对地址，或 ≤32 KiB 的 `data:` URL
- `publishTimestamp` 是 Unix **秒**
- `engines.dsh` 要和包里的 `engines.dsh` 一致
- 文件 UTF-8、2xx、不跳转、≤128 MiB

别人添加源后即可在市场里搜到并一键装。

## 7. 上线前清单

- [ ] `npm view dsh-emoji-panel` 能查到 1.0.0
- [ ] 新建一个干净 profile，`dsh plugin --profile test add dsh-emoji-panel` 装得上、面板能用
- [ ] GitHub 仓库 public、有 README、有 `screenshots.json`、有 `dsh-plugin` topic
- [ ] `package.json` 里 `dsh.bundle` + `dsh.client` 都在
- [ ] 版本号符合 SemVer，升级时 `npm version patch` 再发
- [ ] PR 只有一个 YAML 文件、category 是 `ui`、描述与实现一致
