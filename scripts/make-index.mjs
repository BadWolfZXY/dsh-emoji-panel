/**
 * 生成自建索引 index.json(官方 format 1)。
 *
 * 不依赖 GitHub:发布后 jsDelivr 直接托管包里的文件,
 *   https://cdn.jsdelivr.net/npm/dsh-emoji-panel/index.json
 * 别人在「插件 → 发现 → 添加索引源」填这个地址就能搜到并一键安装。
 *
 * 用法(每次 publish 前跑一次,保证版本和时间戳对得上):
 *   node scripts/make-index.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** 发布时间取 package.json 的版本,用当前时间;重复跑会刷新时间戳。 */
const publishTimestamp = Math.floor(Date.now() / 1000)

const index = {
  format: 1,
  title: { en: 'dsh-emoji-panel', zh: '表情面板' },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Emoji panel', zh: '表情面板' },
      description: {
        en: pkg.description,
        zh: '输入框表情面板：分类标签 + 常驻搜索 + 最近使用 + 自定义表情库（导入图片并写一句含义）。',
      },
      icon: 'icon.svg',
      author: pkg.author,
      homepage: pkg.homepage,
      repository: { url: pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '') },
      metadata: { category: 'ui' },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source: { type: 'npm' },
          engines: { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

const out = join(root, 'index.json')
writeFileSync(out, JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log('wrote', out, 'version', pkg.version, 'timestamp', publishTimestamp)
