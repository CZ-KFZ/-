// ============================================================
// EchoVerse · 共享 Mock 数据
// 集中存放作品 / 文章 / 笔记 / 对话回复，便于页面脚本消费
// ============================================================

// 顶部导航配置（顺序与设计稿一致）
export const NAV_ITEMS = [
  { href: 'index.html', key: 'home', label: '首页' },
  { href: 'chat.html', key: 'chat', label: '对话' },
  { href: 'portfolio.html', key: 'portfolio', label: '作品集' },
  { href: 'garden.html', key: 'garden', label: '数字花园' },
  { href: 'articles.html', key: 'articles', label: '文章' },
  { href: 'about.html', key: 'about', label: '关于我' }
]

// 作品集数据：category 用于筛选，gradient 用于卡片封面渐变
export const PROJECTS = [
  {
    id: 'city-memory',
    title: '城市记忆档案馆',
    category: 'design',
    categoryLabel: '交互装置',
    year: '2024',
    desc: '用 3D 扫描技术还原老城区风貌的互动数字平台，让用户在虚拟空间中漫步、聆听口述历史。',
    gradient: 'from-[var(--evo-purple-700)] to-[var(--evo-cyan)]/30',
    accent: 'purple'
  },
  {
    id: 'mind-garden',
    title: '思维花园',
    category: 'dev',
    categoryLabel: 'Web 应用',
    year: '2023',
    desc: '个人知识管理实验，把 5 年读书笔记组织成 500+ 节点的可视化知识网络。',
    gradient: 'from-[var(--evo-pink)]/40 to-[var(--evo-violet)]/40',
    accent: 'pink'
  },
  {
    id: 'soundscape',
    title: '声景实验室',
    category: 'research',
    categoryLabel: '创意编程',
    year: '2024',
    desc: '基于城市环境声音生成视觉艺术的创意编程项目。',
    gradient: 'from-[var(--evo-cyan)]/40 to-[var(--evo-purple-700)]',
    accent: 'cyan'
  },
  {
    id: 'ebook-system',
    title: '电子书设计系统',
    category: 'design',
    categoryLabel: '产品设计',
    year: '2023',
    desc: '为独立作家打造的一站式电子书排版与发布工具。',
    gradient: 'from-[var(--evo-violet)]/50 to-[var(--evo-pink)]/30',
    accent: 'violet'
  },
  {
    id: 'digital-nomad',
    title: '数字迁徙纪录片',
    category: 'video',
    categoryLabel: '视频制作',
    year: '2024',
    desc: '记录三位数字游民生活方式的短篇纪录片系列。',
    gradient: 'from-[var(--evo-purple-800)] to-[var(--evo-cyan)]/20',
    accent: 'purple'
  },
  {
    id: 'echo-twin',
    title: 'Echo 数字分身',
    category: 'research',
    categoryLabel: 'AI 实验',
    year: '2025',
    desc: '基于个人知识库训练的可交互 3D 数字人项目。',
    gradient: 'from-[var(--evo-pink)]/50 via-[var(--evo-violet)]/50 to-[var(--evo-cyan)]/30',
    accent: 'pink'
  }
]

export const PROJECT_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'design', label: '设计' },
  { key: 'dev', label: '开发' },
  { key: 'research', label: '研究' },
  { key: 'video', label: '视频' }
]

// 文章数据
export const ARTICLES = [
  {
    id: 'design-system',
    title: '当我们谈论设计系统时，我们在谈论什么',
    category: 'design',
    categoryLabel: '设计思考',
    date: '2025年6月15日',
    readTime: '8 分钟阅读',
    excerpt: '设计系统这个词被滥用了。很多人以为做一套组件库就是设计系统，但真正的设计系统远不止于此。它是关于决策的框架，是关于如何在团队中共享设计语言的机制，是组织文化在视觉层面的投射...'
  },
  {
    id: 'digital-twin',
    title: '我用自己的所有文章训练了一个数字分身，这是我的体验',
    category: 'tech',
    categoryLabel: '技术探索',
    date: '2025年5月28日',
    readTime: '12 分钟阅读',
    excerpt: '把过去五年写的 128 篇文章、36 个项目文档、甚至是读书笔记都喂给了一个大模型，然后让它以"我"的身份和别人对话。结果让我既惊讶又不安...'
  },
  {
    id: 'nomad-settle',
    title: '数字游民三年后，我为什么决定安定下来',
    category: 'life',
    categoryLabel: '生活方式',
    date: '2025年4月10日',
    readTime: '6 分钟阅读',
    excerpt: '从清迈到巴厘岛，从里斯本到墨西哥城，三年的数字游民生活教会了我很多。但最终我意识到，自由不是永远在路上，而是能够选择停留在哪里...'
  },
  {
    id: 'creator-compound',
    title: '创作者的"复利效应"：为什么你应该坚持输出',
    category: 'thought',
    categoryLabel: '创意方法',
    date: '2025年3月22日',
    readTime: '10 分钟阅读',
    excerpt: '创作不是一场短跑，而是一场无限游戏。你写的每一篇文章、做的每一个项目，都在为你的下一个作品积累势能。这就是创作者的复利...'
  },
  {
    id: 'attention',
    title: '关于注意力的思考',
    category: 'thought',
    categoryLabel: '哲学思考',
    date: '2025年2月18日',
    readTime: '7 分钟阅读',
    excerpt: '注意力是我们最稀缺的资源，如何分配它决定了我们成为什么样的人。在信息爆炸的时代，专注本身已经成为一种超能力...'
  },
  {
    id: 'slow-creation',
    title: '慢创作宣言',
    category: 'design',
    categoryLabel: '创作方法',
    date: '2025年1月5日',
    readTime: '9 分钟阅读',
    excerpt: '在追求速度的时代，慢下来反而成了一种竞争优势。慢创作不是拖延，而是给思考留出空间，让作品自然生长出它该有的样子...'
  }
]

export const ARTICLE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'design', label: '设计' },
  { key: 'tech', label: '技术' },
  { key: 'life', label: '生活' },
  { key: 'thought', label: '思考' }
]

// 数字花园：知识图谱节点（用于交互式图谱渲染）
export const GARDEN_NODES = [
  { id: 'pkm', label: '个人知识管理', x: 400, y: 250, r: 36, level: 0, color: 'var(--evo-purple-600)', glow: 'purple' },
  { id: 'design-thinking', label: '设计思维', x: 260, y: 160, r: 24, level: 1, color: 'var(--evo-cyan)' },
  { id: 'tech', label: '技术探索', x: 540, y: 160, r: 24, level: 1, color: 'var(--evo-pink)' },
  { id: 'creation', label: '创作方法', x: 260, y: 340, r: 24, level: 1, color: 'var(--evo-pink)' },
  { id: 'philosophy', label: '哲学思考', x: 540, y: 340, r: 24, level: 1, color: 'var(--evo-cyan)' },
  { id: 'ix-design', label: '交互设计', x: 180, y: 100, r: 14, level: 2, parent: 'design-thinking' },
  { id: 'ai-llm', label: 'AI / LLM', x: 620, y: 100, r: 14, level: 2, parent: 'tech' },
  { id: 'writing', label: '写作技巧', x: 180, y: 400, r: 14, level: 2, parent: 'creation' },
  { id: 'meditation', label: '冥想实践', x: 620, y: 400, r: 14, level: 2, parent: 'philosophy' }
]

// 数字花园：节点连线（from -> to 的 id）
export const GARDEN_LINKS = [
  ['pkm', 'design-thinking'],
  ['pkm', 'tech'],
  ['pkm', 'creation'],
  ['pkm', 'philosophy'],
  ['design-thinking', 'ix-design'],
  ['tech', 'ai-llm'],
  ['creation', 'writing'],
  ['philosophy', 'meditation']
]

// 数字花园：最近笔记
export const GARDEN_NOTES = [
  {
    id: 'note-1',
    title: '关于注意力的思考',
    tags: [
      { label: '哲学思考', tone: 'purple' },
      { label: 'productivity', tone: 'cyan' }
    ],
    excerpt: '注意力是我们最稀缺的资源，如何分配它决定了我们成为什么样的人...',
    links: ['← 数字游民', '→ 冥想实践']
  },
  {
    id: 'note-2',
    title: '设计系统的本质',
    tags: [
      { label: '设计思维', tone: 'pink' },
      { label: '系统设计', tone: 'cyan' }
    ],
    excerpt: '设计系统不是组件库，而是一套决策框架和共享语言...'
  },
  {
    id: 'note-3',
    title: 'LLM 时代的创造力',
    tags: [
      { label: '技术探索', tone: 'cyan' },
      { label: 'AI', tone: 'pink' }
    ],
    excerpt: '当 AI 能生成一切，人类的独特价值在哪里？答案可能是品味和判断力...'
  },
  {
    id: 'note-4',
    title: '慢创作宣言',
    tags: [
      { label: '创作方法', tone: 'pink' },
      { label: '写作', tone: 'purple' }
    ],
    excerpt: '在追求速度的时代，慢下来反而成了一种竞争优势...'
  }
]

// 对话历史（侧栏列表）
export const CHAT_HISTORY = [
  { id: 'c1', title: '关于我的职业经历', active: true },
  { id: 'c2', title: '推荐阅读的文章', active: false },
  { id: 'c3', title: '设计项目详情', active: false },
  { id: 'c4', title: '技术栈介绍', active: false }
]

// 对话快捷提问
export const QUICK_PROMPTS = [
  '她的技术栈是什么？',
  '推荐几篇她的文章',
  '她最近在做什么？'
]

// Echo 模拟回复：基于关键词匹配
// matches: 命中关键词数组；reply: 回复 HTML；sources: 引用来源
export const ECHO_REPLIES = [
  {
    matches: ['项目', '代表', '作品', 'portfolio'],
    reply: `<p class="text-[var(--evo-ink)] mb-3">她有几个比较有代表性的项目：</p>
      <ol class="list-decimal list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">
        <li><strong class="text-[var(--evo-ink)]">城市记忆档案馆</strong> — 用 3D 扫描还原老城区风貌，获 2024 数字艺术创新奖。</li>
        <li><strong class="text-[var(--evo-ink)]">思维花园</strong> — 500+ 笔记节点、2000+ 关联的个人知识网络。</li>
        <li><strong class="text-[var(--evo-ink)]">Echo 数字分身</strong> — 就是我啦，用她所有公开内容训练而成。</li>
      </ol>`,
    sources: [
      { label: '作品集 - 3 个项目', tone: 'purple' },
      { label: '文章：关于数字分身的思考', tone: 'cyan' }
    ]
  },
  {
    matches: ['技术栈', '技术', 'stack', '工具', '用什么'],
    reply: `<p class="text-[var(--evo-ink)] mb-2">她的技术栈横跨设计与开发两端：</p>
      <ul class="list-disc list-inside space-y-1.5 text-[var(--evo-ink-2)] text-sm">
        <li><strong class="text-[var(--evo-ink)]">设计</strong>：Figma、设计系统、视觉与交互设计</li>
        <li><strong class="text-[var(--evo-ink)]">前端</strong>：React、TypeScript、Tailwind</li>
        <li><strong class="text-[var(--evo-ink)]">创意编程</strong>：Three.js、WebGL、生成式视觉</li>
        <li><strong class="text-[var(--evo-ink)]">AI</strong>：LLM 应用、RAG、数字分身工程</li>
      </ul>`,
    sources: [{ label: '关于我 - 技能标签', tone: 'purple' }]
  },
  {
    matches: ['文章', '推荐', '阅读', 'blog'],
    reply: `<p class="text-[var(--evo-ink)] mb-3">根据阅读量和反馈，这几篇比较受欢迎：</p>
      <ol class="list-decimal list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">
        <li><strong class="text-[var(--evo-ink)]">当我们谈论设计系统时，我们在谈论什么</strong> — 8 分钟</li>
        <li><strong class="text-[var(--evo-ink)]">我用自己的所有文章训练了一个数字分身</strong> — 12 分钟</li>
        <li><strong class="text-[var(--evo-ink)]">创作者的"复利效应"</strong> — 10 分钟</li>
      </ol>
      <p class="text-[var(--evo-ink-3)] text-xs mt-3">完整文章列表见「文章」页。</p>`,
    sources: [{ label: '文章 - 6 篇', tone: 'cyan' }]
  },
  {
    matches: ['最近', '在做', '现在', '近况'],
    reply: `<p class="text-[var(--evo-ink)]">她最近正在打磨 <strong>EchoVerse</strong> —— 一个个人数字化空间站项目，把作品、文章、笔记、对话编织成一个可探索的网络。这也是你正在浏览的站点本身。</p>
      <p class="text-[var(--evo-ink-2)] text-sm mt-2">同时她在写一篇关于「LLM 时代创作者身份」的长文，预计今年秋天发布。</p>`,
    sources: [{ label: '关于我 - 成长轨迹', tone: 'pink' }]
  },
  {
    matches: ['你是谁', '你是', 'echo', 'Echo', '分身'],
    reply: `<p class="text-[var(--evo-ink)]">我是 Echo，是她的数字分身。我基于她沉淀的所有数字化资产训练而成，可以回答关于她的作品、经历、思考等任何问题。你想了解什么呢？</p>`,
    sources: []
  }
]

// 兜底回复
export const ECHO_FALLBACK_REPLY = `<p class="text-[var(--evo-ink)]">这是个有意思的问题。我目前的知识库主要覆盖她的作品、文章、技术栈和创作思考。你可以试试问我：</p>
  <ul class="list-disc list-inside space-y-1 text-[var(--evo-ink-2)] text-sm mt-2">
    <li>「她最有代表性的项目是什么？」</li>
    <li>「她的技术栈有哪些？」</li>
    <li>「推荐几篇她的文章」</li>
  </ul>`

// 关于我：成长轨迹
export const TIMELINE = [
  {
    period: '2025 — 至今',
    title: '独立创作 · EchoVerse 项目',
    desc: '开始打造个人数字化空间站项目，探索 AI 时代的个人身份和数字资产沉淀方式。',
    dot: 'primary'
  },
  {
    period: '2022 — 2025',
    title: '自由职业 · 数字游民',
    desc: '辞去大厂设计工作，成为独立设计师，服务过 20+ 创业公司。同时开始数字游民生活，旅居 10+ 城市。',
    dot: 'cyan'
  },
  {
    period: '2019 — 2022',
    title: '字节跳动 · 高级设计师',
    desc: '负责教育产品线的设计系统建设，从 0 到 1 搭建了组件库和设计规范，支持 50+ 设计师协作。',
    dot: 'pink'
  },
  {
    period: '2017 — 2019',
    title: '腾讯 · UI 设计师',
    desc: '参与 QQ 音乐的视觉设计工作，负责多个核心功能模块的设计与落地。',
    dot: 'violet'
  },
  {
    period: '2013 — 2017',
    title: '浙江大学 · 工业设计',
    desc: '本科期间开始接触交互设计和前端开发，毕业设计获得校级优秀论文。',
    dot: 'muted'
  }
]

// 关于我：技能标签（tone 控制配色）
export const SKILLS = [
  { label: '交互设计', tone: 'default' },
  { label: '视觉设计', tone: 'default' },
  { label: '产品设计', tone: 'default' },
  { label: '设计系统', tone: 'purple' },
  { label: '前端开发', tone: 'default' },
  { label: 'React', tone: 'default' },
  { label: '创意编程', tone: 'cyan' },
  { label: 'Three.js', tone: 'default' },
  { label: 'AI / LLM', tone: 'pink' },
  { label: '写作', tone: 'default' },
  { label: '视频制作', tone: 'default' },
  { label: '知识管理', tone: 'default' }
]
