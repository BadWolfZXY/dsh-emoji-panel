/**
 * dsh-emoji-panel — 输入框表情面板(Client 半边)。
 *
 * 注册两个会话作用域槽位:
 *   conversation.input.left     → 表情按钮(紧凑工具行里的图标按钮)
 *   conversation.input.overlay  → 浮层面板,render props 带 inputActions / useInput
 *
 * 面板结构:分类标签(含「最近」「自定义」)→ 常驻搜索框 → 内容网格。
 * 插图优先走宿主公开的 insertText(text, captureInsertion()),插在光标处且不覆盖草稿;
 * 拿不到这套 API、或 phase 冻结(模型正在输出)导致插入失败时,退回 setDraft 追加。
 *
 * 数据只落浏览器 localStorage(最近使用、自定义表情),不联网、不上传。
 * 自定义表情插入的是 `[表情: 含义]` 文本标记 —— 模型看见的是这句含义,不是像素。
 *
 * 注册 id 必须等于包名(= loader entry 名),否则 ModuleLoader 报
 * "loaded without registering <id>"。factory 内部的 const 都在函数作用域里,
 * 不会污染宿主拼接多个插件源码时的全局词法作用域。
 */
window.__ModuleLoader__.load({
  id: 'dsh-emoji-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Client locale 命名空间;文案只从字典来,不散落在组件里。 */
    const NS = 'emoji-panel'
    /** <style> 归属标记:宿主会给无主 style 打上当前物化模块的名字,模块一变更就被连带删掉。 */
    const STYLE_OWNER = 'dsh-emoji-panel'
    /** 触发按钮标记,panel 用它区分「点按钮关面板」和「点外部关面板」。 */
    const TRIGGER_ATTR = 'data-emoji-panel-trigger'
    /** 本地存储键:最近使用的 emoji 字符 / 自定义表情包。 */
    const RECENT_KEY = 'dsh-emoji-panel:recent'
    const CUSTOM_KEY = 'dsh-emoji-panel:custom'
    const RECENT_MAX = 24
    const CUSTOM_MAX = 60
    /** 导入时压到这个边长以内再存,避免 localStorage 配额被一张大图吃完。 */
    const THUMB_EDGE = 160

    // ---------------------------------------------------------------- 文案

    const ZH = {
      trigger: '表情',
      title: '表情',
      search: '搜索表情',
      searchPlaceholder: '搜索:笑、猫、狗头嘲讽…',
      empty: '没有匹配的表情',
      recentEmpty: '还没用过表情,点一个就会出现在这里',
      customEmpty: '还没有自定义表情,用上面的「从文件」或图片网址导入',
      importFile: '从文件',
      importUrlPlaceholder: '粘贴图片网址',
      importFetch: '导入',
      importFailed: '导入失败,换个文件或网址再试',
      captionRequired: '给表情写一句含义,AI 才能看懂它',
      captionPlaceholder: '这个表情什么意思?例:狗头嘲讽',
      storageFull: '本地空间不足,删掉几个旧表情再试',
      save: '保存',
      cancel: '取消',
      remove: '删除',
      'tab.recent': '最近',
      'tab.faces': '默认表情',
      'tab.gestures': '手势',
      'tab.animals': '动物',
      'tab.food': '食物',
      'tab.activity': '活动',
      'tab.travel': '出行',
      'tab.objects': '物品',
      'tab.symbols': '符号',
      'tab.custom': '自定义',
    }

    const EN = {
      trigger: 'Emoji',
      title: 'Emoji',
      search: 'Search emoji',
      searchPlaceholder: 'Search: smile, cat, …',
      empty: 'No matching emoji',
      recentEmpty: 'Emoji you use will show up here',
      customEmpty: 'No custom memes yet — import a file or an image URL above',
      importFile: 'File',
      importUrlPlaceholder: 'Paste an image URL',
      importFetch: 'Import',
      importFailed: 'Import failed — try another file or URL',
      captionRequired: 'Add a meaning so the model can understand it',
      captionPlaceholder: 'What does it mean? e.g. sarcastic dog',
      storageFull: 'Local storage is full — delete a few memes and retry',
      save: 'Save',
      cancel: 'Cancel',
      remove: 'Delete',
      'tab.recent': 'Recent',
      'tab.faces': 'Faces',
      'tab.gestures': 'Hands',
      'tab.animals': 'Animals',
      'tab.food': 'Food',
      'tab.activity': 'Activity',
      'tab.travel': 'Travel',
      'tab.objects': 'Objects',
      'tab.symbols': 'Symbols',
      'tab.custom': 'Mine',
    }

    // ---------------------------------------------------------------- 样式
    // 只用宿主主题 token(--dsw-alias-*),明暗主题都跟着走;不带写死的品牌色/阴影。

    const CSS = [
      '.emoji-panel-trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:1;transition:background .12s,color .12s}',
      '.emoji-panel-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.emoji-panel-trigger[aria-expanded="true"]{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}',
      // overlay 槽位渲染在 composer card 里,所以 absolute + bottom:100% 天然浮在输入框上方,
      // 不遮挡输入框、也不参与输入框的高度分配。
      '.emoji-panel-root{position:absolute;bottom:calc(100% + 8px);left:0;z-index:2147481500;box-sizing:border-box;width:min(380px,92vw);height:380px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px}',
      '.emoji-panel-tabs{flex:none;display:flex;flex-wrap:wrap;gap:2px;padding:6px 6px 2px}',
      '.emoji-panel-tab{flex:none;padding:5px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.2;white-space:nowrap;cursor:pointer}',
      '.emoji-panel-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.emoji-panel-tab[aria-pressed="true"]{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}',
      // 搜索框常驻在分类下面:换分类不清空关键词,清空关键词就回到当前分类
      '.emoji-panel-search{flex:none;padding:6px 8px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.emoji-panel-search input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
      '.emoji-panel-search input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.emoji-panel-search input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.emoji-panel-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:2px;align-content:start}',
      '.emoji-panel-grid.is-custom{grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:8px}',
      '.emoji-panel-cell{display:flex;align-items:center;justify-content:center;height:34px;padding:0;border:none;border-radius:8px;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;user-select:none}',
      '.emoji-panel-cell:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.emoji-panel-cell:active{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}',
      '.emoji-panel-empty{flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:28px 16px;text-align:center;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      // 自定义表情:导入条 + 保存表单 + 网格
      '.emoji-panel-import{flex:none;display:flex;gap:6px;align-items:center;padding:8px 8px 0}',
      '.emoji-panel-chip{flex:none;padding:5px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.4;cursor:pointer}',
      '.emoji-panel-chip:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.emoji-panel-chip:disabled{opacity:.5;cursor:default;border-color:var(--dsw-alias-border-l1)}',
      '.emoji-panel-field{flex:1;min-width:0;box-sizing:border-box;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
      '.emoji-panel-field:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.emoji-panel-form{flex:none;display:flex;gap:6px;align-items:center;padding:8px 8px 0}',
      '.emoji-panel-form-preview{flex:none;width:38px;height:38px;object-fit:cover;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.emoji-panel-notice{flex:none;padding:6px 10px 0;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.4}',
      '.emoji-panel-meme{position:relative;min-width:0}',
      '.emoji-panel-meme-pick{display:block;width:100%;aspect-ratio:1/1;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
      '.emoji-panel-meme-pick img{display:block;width:100%;height:100%;object-fit:cover}',
      '.emoji-panel-meme-pick:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.emoji-panel-meme-del{position:absolute;top:-6px;right:-6px;width:18px;height:18px;padding:0;line-height:1;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer;opacity:0;transition:opacity .12s}',
      '.emoji-panel-meme:hover .emoji-panel-meme-del{opacity:1}',
      '.emoji-panel-meme:focus-within .emoji-panel-meme-del{opacity:1}',
      '.emoji-panel-meme-del:focus-visible{opacity:1}',
      '.emoji-panel-meme-del:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
    ].join('')

    // ---------------------------------------------------------------- 数据
    // 每行 = 「字符 + 空格分隔的关键词(中英混排)」,搜索匹配字符本身和关键词。
    // 加自己的 emoji:往对应分组里加一行就行,不需要动别的代码。

    const GROUP_DEFS = [
      {
        id: 'faces',
        items: [
          '😀 笑 开心 咧嘴 grin smile happy',
          '😃 笑 开心 大笑 smile joy',
          '😄 笑 开心 眯眼 laugh happy',
          '😁 得意 露齿 笑 grin beam',
          '😆 大笑 哈哈 笑 laugh satisfied',
          '😅 冷汗 尴尬 笑 sweat smile',
          '🤣 爆笑 打滚 笑 rofl',
          '😂 笑哭 大笑 笑 joy tears',
          '🙂 微笑 笑 smile',
          '🙃 倒脸 无语 upside down',
          '😉 眨眼 眼 wink',
          '😊 害羞 微笑 开心 blush smile',
          '😇 天使 光环 angel innocent',
          '🥰 喜欢 爱心 甜 love adore',
          '😍 花痴 爱心 喜欢 heart eyes',
          '🤩 星星眼 惊叹 wow star',
          '😘 亲亲 飞吻 kiss',
          '😋 好吃 馋 吐舌 yummy tongue',
          '😛 吐舌 调皮 tongue',
          '😜 吐舌 眨眼 调皮 wink tongue',
          '🤪 搞怪 疯狂 zany',
          '🤗 拥抱 抱 hug',
          '🤭 偷笑 捂嘴 giggle',
          '🤔 思考 想 疑惑 think',
          '😐 无语 平静 neutral',
          '😶 沉默 没嘴 no mouth',
          '😏 得意 坏笑 smirk',
          '😒 不爽 无奈 unamused',
          '🙄 翻白眼 无语 roll eyes',
          '😬 尴尬 龇牙 grimace',
          '😌 放松 安心 relieved',
          '😔 失落 难过 pensive',
          '😪 困 睡 sleepy',
          '😴 睡觉 困 zzz sleep',
          '😷 口罩 生病 mask',
          '🤒 发烧 生病 fever',
          '🤕 受伤 绷带 bandage',
          '🤢 恶心 想吐 nausea',
          '🥵 热 出汗 hot',
          '🥶 冷 冻 cold',
          '😵 晕 眼花 dizzy',
          '🤯 爆炸 震惊 mind blown',
          '🥳 派对 庆祝 生日 party',
          '😎 酷 墨镜 cool',
          '🤓 书呆 眼镜 nerd',
          '😕 困惑 疑惑 confused',
          '😟 担心 忧虑 worried',
          '🙁 难过 皱眉 frown',
          '😮 惊讶 哇 wow',
          '😲 震惊 吃惊 astonished',
          '😳 脸红 尴尬 flushed',
          '🥺 委屈 可怜 求求 pleading',
          '😢 哭 难过 cry',
          '😭 大哭 伤心 哭 sob',
          '😱 害怕 尖叫 scream',
          '😤 生气 哼 triumph',
          '😠 生气 愤怒 angry',
          '😡 愤怒 生气 rage',
          '😈 恶魔 坏笑 devil',
          '👻 鬼 幽灵 ghost',
          '💀 骷髅 skull',
          '🤖 机器人 robot',
          '💩 便便 屎 poop',
          '😺 猫 笑 cat',
        ],
      },
      {
        id: 'gestures',
        items: [
          '👍 赞 好 顶 like thumb up',
          '👎 差 踩 dislike thumb down',
          '👌 ok 好 没问题 ok',
          '✌️ 胜利 耶 v peace',
          '🤞 祈祷 好运 crossed fingers',
          '🤟 爱你 手势 love you',
          '🤘 摇滚 手势 rock',
          '👏 鼓掌 拍手 clap',
          '🙌 举手 庆祝 raise hands',
          '🙏 拜托 感谢 祈祷 pray thanks',
          '👋 挥手 再见 你好 wave',
          '🤝 握手 合作 handshake',
          '💪 加油 肌肉 强壮 muscle',
          '👉 指 右 点 point right',
          '👈 指 左 点 point left',
          '👆 指 上 点 point up',
          '👇 指 下 点 point down',
          '✋ 举手 停 hand',
          '👊 拳头 加油 fist',
          '✊ 拳 力量 加油 fist',
          '🤙 打电话 号码 call me',
          '👀 眼睛 看 关注 eyes',
          '🧠 大脑 聪明 brain',
        ],
      },
      {
        id: 'animals',
        items: [
          '🐶 狗 狗狗 dog',
          '🐱 猫 猫咪 cat',
          '🐭 鼠 老鼠 mouse',
          '🐹 仓鼠 hamster',
          '🐰 兔 兔子 rabbit',
          '🐻 熊 bear',
          '🐼 熊猫 panda',
          '🐨 考拉 koala',
          '🐯 老虎 tiger',
          '🦁 狮子 lion',
          '🐮 牛 cow',
          '🐷 猪 pig',
          '🐸 青蛙 蛙 frog',
          '🐵 猴子 monkey',
          '🐔 鸡 chicken',
          '🐧 企鹅 penguin',
          '🐦 鸟 bird',
          '🦄 独角兽 unicorn',
          '🐝 蜜蜂 bee',
          '🦋 蝴蝶 butterfly',
          '🐢 乌龟 龟 turtle',
          '🐍 蛇 snake',
          '🐙 章鱼 octopus',
          '🐬 海豚 dolphin',
          '🐳 鲸鱼 whale',
          '🦊 狐狸 fox',
        ],
      },
      {
        id: 'food',
        items: [
          '🍎 苹果 apple',
          '🍊 橘子 orange',
          '🍋 柠檬 lemon',
          '🍉 西瓜 watermelon',
          '🍇 葡萄 grape',
          '🍓 草莓 strawberry',
          '🍑 桃 peach',
          '🍒 樱桃 cherry',
          '🍌 香蕉 banana',
          '🥑 牛油果 avocado',
          '🍞 面包 bread',
          '🥐 可颂 面包 croissant',
          '🍕 披萨 pizza',
          '🍔 汉堡 burger',
          '🍟 薯条 fries',
          '🍜 拉面 面 noodle',
          '🍚 米饭 饭 rice',
          '🍣 寿司 sushi',
          '🍰 蛋糕 cake',
          '🍩 甜甜圈 donut',
          '🍪 饼干 cookie',
          '🍫 巧克力 chocolate',
          '🍿 爆米花 popcorn',
          '☕ 咖啡 coffee',
          '🍺 啤酒 beer',
          '🍻 干杯 碰杯 cheers',
          '🥂 干杯 香槟 cheers',
          '🍷 红酒 wine',
          '🍵 茶 tea',
          '🥤 饮料 可乐 drink',
        ],
      },
      {
        id: 'activity',
        items: [
          '⚽ 足球 球 soccer',
          '🏀 篮球 basketball',
          '🏈 橄榄球 football',
          '🎾 网球 tennis',
          '🏸 羽毛球 badminton',
          '🎱 台球 billiards',
          '🏆 奖杯 冠军 trophy',
          '🥇 金牌 第一 medal',
          '🎮 游戏 手柄 game',
          '🎯 目标 正中 target',
          '🎨 艺术 画画 art',
          '🎧 耳机 音乐 headphones',
          '🎤 麦克风 唱歌 mic',
          '🎸 吉他 音乐 guitar',
          '🎬 电影 打板 movie',
          '🎉 庆祝 派对 party',
          '🎂 生日 蛋糕 birthday',
        ],
      },
      {
        id: 'travel',
        items: [
          '🚗 车 汽车 car',
          '🚕 出租车 taxi',
          '🚙 车 越野 suv',
          '🚌 公交车 bus',
          '✈️ 飞机 飞 plane',
          '🚀 火箭 rocket',
          '🚲 自行车 bike',
          '🚄 高铁 火车 train',
          '🚢 船 轮船 ship',
          '🏠 家 房子 house',
          '🏢 大楼 公司 office',
          '🏥 医院 hospital',
          '🏫 学校 school',
          '🏖️ 海滩 沙滩 beach',
          '⛰️ 山 mountain',
          '🌙 月亮 夜 moon',
          '☀️ 太阳 晴 sun',
        ],
      },
      {
        id: 'objects',
        items: [
          '💡 灯泡 想法 idea',
          '📱 手机 phone',
          '💻 电脑 笔记本 laptop',
          '⌨️ 键盘 keyboard',
          '📷 相机 camera',
          '🎁 礼物 gift',
          '📦 快递 箱子 package',
          '📚 书 学习 books',
          '✏️ 铅笔 pencil',
          '📝 笔记 记录 memo',
          '📌 图钉 标记 pin',
          '🔑 钥匙 key',
          '🔒 锁 安全 lock',
          '💰 钱 钱袋 money',
          '💳 银行卡 card',
          '📅 日历 日期 calendar',
          '⏰ 闹钟 时间 alarm',
          '🔔 提醒 铃 bell',
          '🔍 搜索 放大镜 search',
        ],
      },
      {
        id: 'symbols',
        items: [
          '❤️ 爱 心 红心 love heart',
          '🧡 橙色 心 orange heart',
          '💛 黄色 心 yellow heart',
          '💚 绿色 心 green heart',
          '💙 蓝色 心 blue heart',
          '💜 紫色 心 purple heart',
          '🖤 黑色 心 black heart',
          '💔 心碎 伤心 broken heart',
          '💯 满分 一百分 100',
          '✅ 完成 对 勾 check',
          '❌ 错 叉 x',
          '⚠️ 警告 注意 warning',
          '❓ 问号 疑问 question',
          '❗ 感叹 注意 exclamation',
          '🔥 火 热 赞 fire',
          '⭐ 星 收藏 star',
          '✨ 闪 亮 新 sparkles',
          '🎵 音乐 音符 music',
          '🎶 音符 music',
          '💤 睡 困 zzz',
        ],
      },
    ]

    /** 把一行数据拆成 { char, words, haystack },与语言无关,启动时算一次。 */
    function parseGroup(definition) {
      const items = definition.items.map((line) => {
        const parts = line.split(/\s+/)
        const char = parts[0]
        const words = parts.slice(1)
        return { char, words, haystack: (char + ' ' + words.join(' ')).toLowerCase() }
      })
      return { id: definition.id, items }
    }

    const GROUPS = GROUP_DEFS.map(parseGroup)
    const ALL_ITEMS = GROUPS.reduce((acc, group) => acc.concat(group.items), [])
    const TABS = ['recent'].concat(GROUPS.map((group) => group.id)).concat(['custom'])

    // ---------------------------------------------------------------- 本地存储
    // 只存最近的字符和自定义表情(缩略图 dataURL);读失败一律当空,不让坏数据把面板带崩。

    function readList(key) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return []
        const raw = window.localStorage.getItem(key)
        const value = raw ? JSON.parse(raw) : []
        return Array.isArray(value) ? value : []
      } catch (error) {
        return []
      }
    }

    function writeList(key, list) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return false
        window.localStorage.setItem(key, JSON.stringify(list))
        return true
      } catch (error) {
        // 配额满 / 隐私模式禁用存储
        return false
      }
    }

    // ---------------------------------------------------------------- 图片
    // 导入时压到 THUMB_EDGE 以内再存;跨域图片拿不到像素(CORS)时退回存原始 URL。

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('read failed'))
        reader.readAsDataURL(file)
      })
    }

    function loadImage(src, crossOrigin) {
      return new Promise((resolve, reject) => {
        const image = new Image()
        if (crossOrigin) image.crossOrigin = 'anonymous'
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('image failed'))
        image.src = src
      })
    }

    async function makeThumb(src) {
      const image = await loadImage(src, true)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) throw new Error('empty image')
      const scale = Math.min(1, THUMB_EDGE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d context')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      // 跨域图片会把 canvas 变成 tainted,toDataURL 抛 SecurityError —— 由调用方退回 URL。
      // 用 webp:支持透明(JPEG 会把透明区压成黑底),体积也小;浏览器不支持时退回 png。
      const webp = canvas.toDataURL('image/webp', 0.85)
      if (webp.indexOf('data:image/webp') === 0) return webp
      return canvas.toDataURL('image/png')
    }

    // ---------------------------------------------------------------- 工具

    /** 按钮和面板分别在两个槽位,用一个小 store 共享「面板开着没」。 */
    function createStore() {
      let state = { open: false }
      const listeners = new Set()
      const emit = () => {
        for (const listener of Array.from(listeners)) listener()
      }
      return {
        get: () => state,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        toggle: () => {
          state = { open: !state.open }
          emit()
        },
        close: () => {
          if (!state.open) return
          state = { open: false }
          emit()
        },
      }
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.get)
    }

    /**
     * 当前生效语言 id:先问 locale 服务(getLocale().active),再退回 <html lang>。
     * 只用来在本文件这两份字典里挑一份 —— 文案不依赖宿主按命名空间查找。
     */
    function detectLocaleId(locale) {
      try {
        if (locale && typeof locale.getLocale === 'function') {
          const snapshot = locale.getLocale()
          if (snapshot && snapshot.active) return String(snapshot.active)
        }
      } catch (error) {
        /* 落到 <html lang> */
      }
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) {
          return String(document.documentElement.lang)
        }
      } catch (error) {
        /* 没有 DOM */
      }
      return ''
    }

    /**
     * 挑字典。检测不到语言时按中文显示(这份插件的主语言是中文),
     * 只有明确检测到非中文才走英文基线。
     */
    function pickDict(locale) {
      const id = detectLocaleId(locale)
      if (!id) return ZH
      return /^zh/i.test(id) ? ZH : EN
    }

    /**
     * 取翻译函数。订阅 locale revision 是为了切换语言后已挂载的组件能重渲染。
     * 这里直接按 active 语言选字典,不调 locale.bind() —— 命名空间没注册成功时
     * bind 会拿不到词条,面板就会整体回落成英文。
     */
    function useTranslate(locale) {
      const subscribe = React.useCallback(
        (callback) => (locale && typeof locale.subscribe === 'function' ? locale.subscribe(callback) : () => {}),
        [locale],
      )
      const getSnapshot = React.useCallback(() => {
        if (!locale || typeof locale.getSnapshot !== 'function') return 0
        try {
          return locale.getSnapshot().revision
        } catch (error) {
          return 0
        }
      }, [locale])
      const revision = React.useSyncExternalStore(subscribe, getSnapshot)
      return React.useMemo(() => {
        const dict = pickDict(locale)
        return (key) => dict[key] || EN[key] || ZH[key] || key
      }, [locale, revision])
    }

    // ---------------------------------------------------------------- 按钮

    /**
     * 返回组件函数。这个工厂必须在 slot 的 render 回调**外**调用一次:
     * 回调里现建函数组件会让 React 每次重渲染都当成新组件类型,导致这块
     * unmount/remount(实测流式输出时每秒 20+ 次),进而唤醒宿主里的 MutationObserver。
     */
    function makeEmojiButton(store) {
      return function EmojiButton(props) {
        const t = useTranslate(props && props.locale)
        const snapshot = useStore(store)
        const open = !!(snapshot && snapshot.open)
        return h(
          'button',
          {
            type: 'button',
            className: 'emoji-panel-trigger',
            [TRIGGER_ATTR]: '',
            title: t('trigger'),
            'aria-label': t('trigger'),
            'aria-expanded': open,
            // 不抢输入框焦点:按钮一拿焦点,contenteditable 就失焦,插完字光标不在输入框里,
            // 后续打字也进不去。click 不受 pointerdown 取消影响,开关照样生效。
            onPointerDown: (event) => event.preventDefault(),
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              store.toggle()
            },
          },
          h(
            'svg',
            {
              viewBox: '0 0 24 24',
              width: 20,
              height: 20,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.8,
              strokeLinecap: 'round',
              'aria-hidden': true,
              style: { display: 'block' },
            },
            h('circle', { cx: 12, cy: 12, r: 9 }),
            h('circle', { cx: 9.1, cy: 10, r: 0.95, fill: 'currentColor', stroke: 'none' }),
            h('circle', { cx: 14.9, cy: 10, r: 0.95, fill: 'currentColor', stroke: 'none' }),
            h('path', { d: 'M8.4 14.4c.9 1.2 2.1 1.8 3.6 1.8s2.7-.6 3.6-1.8' }),
          ),
        )
      }
    }

    // ---------------------------------------------------------------- 面板

    function EmojiPanel(props) {
      const store = props.store
      const actions = props.inputActions
      const t = useTranslate(props.locale)
      // 草稿只能从宿主的 useInput 读:这个槽位的 props 没有 input,只有 hooks 派生的 useInput。
      // 拿不到钩子(宿主侧改动)时兜底为 null,退化成「追加到末尾」。
      const useLiveInput = typeof props.useInput === 'function' ? props.useInput : () => null
      const inputState = useLiveInput((state) => state)
      const snapshot = useStore(store)
      const open = !!(snapshot && snapshot.open)

      const [tab, setTab] = React.useState('faces')
      const [query, setQuery] = React.useState('')
      const [recent, setRecent] = React.useState(() => readList(RECENT_KEY))
      const [custom, setCustom] = React.useState(() => readList(CUSTOM_KEY))
      const [draftSrc, setDraftSrc] = React.useState('')
      const [draftCaption, setDraftCaption] = React.useState('')
      const [urlInput, setUrlInput] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const rootRef = React.useRef(null)
      const fileRef = React.useRef(null)

      // 每次打开重新读一遍本地库:别的标签页或上一轮会话的改动也能立刻看到
      React.useEffect(() => {
        if (!open) return
        setRecent(readList(RECENT_KEY))
        setCustom(readList(CUSTOM_KEY))
      }, [open])

      // 点外部 / Esc 关闭。捕获阶段装,输入框或别的控件 stopPropagation 也关得掉。
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event && event.target
          if (!target || typeof target.closest !== 'function') return
          if (rootRef.current && rootRef.current.contains(target)) return
          if (target.closest('[' + TRIGGER_ATTR + ']')) return
          store.close()
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          store.close()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open, store])

      const pushRecent = (char) => {
        setRecent((previous) => {
          const next = [char].concat(previous.filter((item) => item !== char)).slice(0, RECENT_MAX)
          writeList(RECENT_KEY, next)
          return next
        })
      }

      /**
       * 插入文本。
       * captureInsertion() 必须和 insertText() 同一轮调用,锚点才有效;插入成功不覆盖草稿,
       * 也不清掉 quote chip。模型还在输出时 phase 冻结会失败,退回整段 setDraft 追加。
       */
      const insert = (text, recentKey) => {
        let inserted = false
        try {
          if (actions && typeof actions.captureInsertion === 'function' && typeof actions.insertText === 'function') {
            inserted = actions.insertText(text, actions.captureInsertion()) === true
          }
        } catch (error) {
          inserted = false
        }
        if (!inserted) {
          const draft = inputState && typeof inputState.draft === 'string' ? inputState.draft : ''
          try {
            if (actions && typeof actions.setDraft === 'function') actions.setDraft(draft + text)
          } catch (error) {
            /* 宿主没暴露 setDraft:放弃这一次,不影响面板 */
          }
        }
        if (recentKey) pushRecent(recentKey)
        // 选完就收起面板:插入走后不再挡着输入框。
        store.close()
        // 再把键盘焦点还给输入框:Host 的 insertText → replaceText 已经把 Lexical 选区
        // 落在插入内容之后(span-map 里写明 "The caret lands after the insertion"),
        // 差的只是焦点 —— 不 focus 的话光标看不见、接着打字的字符也进不去。
        try {
          if (actions && typeof actions.focus === 'function') actions.focus()
        } catch (error) {
          /* 宿主没暴露 focus:焦点本来就在输入框时(按钮已 preventDefault)不受影响 */
        }
      }

      /** 自定义表情插入的是含义文本:模型读得到,人和宿主都不用理解图片。 */
      const insertMeme = (meme) => insert('[表情: ' + meme.caption + ']')

      const resetImport = () => {
        setDraftSrc('')
        setDraftCaption('')
        setUrlInput('')
        setBusy(false)
      }

      const pickFile = async (event) => {
        const input = event.target
        const file = input.files && input.files[0]
        input.value = ''
        if (!file) return
        setNotice('')
        setBusy(true)
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const thumb = await makeThumb(dataUrl).catch(() => '')
          setDraftSrc(thumb || dataUrl)
          setDraftCaption('')
        } catch (error) {
          setNotice(t('importFailed'))
        } finally {
          setBusy(false)
        }
      }

      const loadFromUrl = async () => {
        const url = urlInput.trim()
        if (!url) return
        setNotice('')
        setBusy(true)
        try {
          // 同源或带 CORS 的图片能压成缩略图;拿不到像素就只存地址(显示仍然可用)
          const thumb = await makeThumb(url).catch(() => '')
          setDraftSrc(thumb || url)
          setDraftCaption('')
        } catch (error) {
          setNotice(t('importFailed'))
        } finally {
          setBusy(false)
        }
      }

      const saveMeme = () => {
        const caption = draftCaption.trim()
        if (!draftSrc) return
        if (!caption) {
          setNotice(t('captionRequired'))
          return
        }
        // id 加随机后缀:同一毫秒内连存两张也不会撞 key
        const id = 'm' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
        const next = [{ id, src: draftSrc, caption }].concat(custom).slice(0, CUSTOM_MAX)
        if (!writeList(CUSTOM_KEY, next)) {
          setNotice(t('storageFull'))
          return
        }
        setCustom(next)
        setNotice('')
        resetImport()
      }

      const removeMeme = (id) => {
        const next = custom.filter((meme) => meme.id !== id)
        writeList(CUSTOM_KEY, next)
        setCustom(next)
      }

      const needle = query.trim().toLowerCase()
      const searching = needle.length > 0

      const items = React.useMemo(() => {
        if (searching) {
          const hits = []
          for (const item of ALL_ITEMS) {
            if (item.char === needle || item.haystack.indexOf(needle) !== -1) {
              hits.push({ kind: 'emoji', key: item.char, char: item.char, words: item.words })
            }
          }
          for (const meme of custom) {
            if (String(meme.caption || '').toLowerCase().indexOf(needle) !== -1) {
              hits.push({ kind: 'meme', key: meme.id, meme })
            }
          }
          return hits
        }
        if (tab === 'custom') return custom.map((meme) => ({ kind: 'meme', key: meme.id, meme }))
        if (tab === 'recent') {
          return recent.map((char) => ({ kind: 'emoji', key: char, char, words: [] }))
        }
        const group = GROUPS.find((candidate) => candidate.id === tab)
        return (group ? group.items : []).map((item) => ({
          kind: 'emoji',
          key: item.char,
          char: item.char,
          words: item.words,
        }))
      }, [searching, needle, tab, recent, custom])

      const hasMeme = items.some((item) => item.kind === 'meme')

      if (!open) return null

      const emptyText = searching
        ? t('empty')
        : tab === 'recent'
          ? t('recentEmpty')
          : tab === 'custom'
            ? t('customEmpty')
            : t('empty')

      const renderCell = (item) => {
        if (item.kind === 'meme') {
          const meme = item.meme
          return h(
            'div',
            { key: item.key, className: 'emoji-panel-meme' },
            h(
              'button',
              {
                type: 'button',
                className: 'emoji-panel-meme-pick',
                title: meme.caption,
                onPointerDown: (event) => event.preventDefault(),
                onClick: () => insertMeme(meme),
              },
              h('img', { src: meme.src, alt: meme.caption, loading: 'lazy' }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'emoji-panel-meme-del',
                title: t('remove'),
                'aria-label': t('remove'),
                onPointerDown: (event) => event.preventDefault(),
                onClick: () => removeMeme(meme.id),
              },
              '×',
            ),
          )
        }
        return h(
          'button',
          {
            key: item.key,
            type: 'button',
            className: 'emoji-panel-cell',
            title: item.words.length ? item.words.slice(0, 4).join(' ') : item.char,
            // 按下时不让按钮抢走输入框焦点:contenteditable 的选择区间还在,
            // captureInsertion() 才能拿到真正的光标位置。
            onPointerDown: (event) => event.preventDefault(),
            onClick: () => insert(item.char, item.char),
          },
          item.char,
        )
      }

      return h(
        'div',
        {
          className: 'emoji-panel-root',
          role: 'dialog',
          'aria-label': t('title'),
          ref: rootRef,
          // 面板里任何一次点击都不该把焦点从输入框抢走(输入框/网址/含义输入框除外)
          onPointerDown: (event) => {
            const target = event.target
            if (target && typeof target.closest === 'function' && target.closest('input, textarea')) return
            event.preventDefault()
          },
        },
        h(
          'div',
          // 分类是一排互斥的切换按钮,不是 ARIA tabs(没有箭头键导航和 tab↔panel
          // 的 id 关联),用 aria-pressed 如实表达,别让读屏以为是 tab 组件。
          { className: 'emoji-panel-tabs', role: 'group', 'aria-label': t('title') },
          TABS.map((id) =>
            h(
              'button',
              {
                key: id,
                type: 'button',
                className: 'emoji-panel-tab',
                'aria-pressed': id === tab && !searching,
                onClick: () => {
                  setTab(id)
                  // 切分类顺手清掉搜索词,否则看起来「点了没反应」
                  if (query) setQuery('')
                },
              },
              t('tab.' + id),
            ),
          ),
        ),
        // 搜索框常驻:不再单独占一个分类标签
        h(
          'div',
          { className: 'emoji-panel-search' },
          h('input', {
            type: 'text',
            value: query,
            placeholder: t('searchPlaceholder'),
            'aria-label': t('search'),
            onChange: (event) => setQuery(event.target.value),
          }),
        ),
        tab === 'custom' && !searching
          ? h(
              'div',
              { className: 'emoji-panel-import' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'emoji-panel-chip',
                  onPointerDown: (event) => event.preventDefault(),
                  onClick: () => fileRef.current && fileRef.current.click(),
                },
                t('importFile'),
              ),
              h('input', {
                ref: fileRef,
                type: 'file',
                accept: 'image/*',
                style: { display: 'none' },
                onChange: pickFile,
              }),
              h('input', {
                type: 'text',
                className: 'emoji-panel-field',
                value: urlInput,
                placeholder: t('importUrlPlaceholder'),
                'aria-label': t('importUrlPlaceholder'),
                onChange: (event) => setUrlInput(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  loadFromUrl()
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'emoji-panel-chip',
                  disabled: busy || !urlInput.trim(),
                  onPointerDown: (event) => event.preventDefault(),
                  onClick: loadFromUrl,
                },
                t('importFetch'),
              ),
            )
          : null,
        // 待保存的导入只在「自定义」标签里显示,切走时保留内容但不挡别的分类
        draftSrc && tab === 'custom'
          ? h(
              'div',
              { className: 'emoji-panel-form' },
              h('img', { className: 'emoji-panel-form-preview', src: draftSrc, alt: '' }),
              h('input', {
                type: 'text',
                className: 'emoji-panel-field',
                value: draftCaption,
                placeholder: t('captionPlaceholder'),
                'aria-label': t('captionPlaceholder'),
                onChange: (event) => setDraftCaption(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  saveMeme()
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'emoji-panel-chip',
                  onPointerDown: (event) => event.preventDefault(),
                  onClick: saveMeme,
                },
                t('save'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'emoji-panel-chip',
                  onPointerDown: (event) => event.preventDefault(),
                  onClick: resetImport,
                },
                t('cancel'),
              ),
            )
          : null,
        notice ? h('div', { className: 'emoji-panel-notice' }, notice) : null,
        items.length === 0
          ? h('div', { className: 'emoji-panel-empty' }, emptyText)
          : h(
              'div',
              {
                className: hasMeme ? 'emoji-panel-grid is-custom' : 'emoji-panel-grid',
                role: 'group',
                'aria-label': searching ? t('search') : t('tab.' + tab),
              },
              items.map(renderCell),
            ),
      )
    }

    // ---------------------------------------------------------------- apply

    function apply(ctx) {
      const locale = ctx.get('locale')

      ctx.effect(() => {
        const style = document.createElement('style')
        // 预标记归属:无主 <style> 会被宿主认到当时物化的模块名下,那个模块一变更就
        // 连标签删掉,表现是面板样式突然全丢(要重启宿主才好)。
        style.setAttribute('data-plugin', STYLE_OWNER)
        style.textContent = CSS
        document.head.appendChild(style)
        return () => {
          if (style.parentNode) style.parentNode.removeChild(style)
        }
      }, 'emoji-panel: styles')

      if (locale && typeof locale.register === 'function') {
        for (const entry of [['zh', ZH], ['en', EN]]) {
          ctx.effect(() => {
            try {
              return locale.register(NS, entry[0], entry[1])
            } catch (error) {
              // 重复注册会抛;已经注册过就保持现状,不让整个插件挂掉。
              return () => {}
            }
          }, 'emoji-panel: locale ' + entry[0])
        }
      }

      const slots = ctx.get('slots')
      if (!slots) return

      const store = createStore()
      const EmojiButton = makeEmojiButton(store)
      // thunk 形式:locale 切换后投影重新取值,不用重注册。
      const label = () => pickDict(locale).trigger || EN.trigger

      slots.inject('conversation.input.left', () =>
        slots.register(
          { name: 'conversation.input.left', id: 'emoji-panel', order: 6, label },
          () => h(EmojiButton, { locale }),
        ),
      )

      slots.inject('conversation.input.overlay', () =>
        slots.register(
          { name: 'conversation.input.overlay', id: 'emoji-panel', order: 6, label },
          (slotProps) =>
            h(EmojiPanel, {
              store,
              locale,
              inputActions: slotProps.inputActions,
              useInput: slotProps.useInput,
            }),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply,
    }
  },
})
