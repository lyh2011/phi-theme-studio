export type GuideBlock =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; items: { label: string; text: string }[] }
  /** Like `steps`, but the label is a full question so it needs its own line. */
  | { kind: 'qa'; items: { label: string; text: string }[] }
  | { kind: 'tip'; text: string }
  | { kind: 'code'; text: string }

export interface GuideStep {
  id: string
  nav: string
  title: string
  lead: string
  blocks: GuideBlock[]
}

/** Single source of truth for the in-app guide and the generated docs page. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'intro',
    nav: '开始之前',
    title: '这个工具是做什么的',
    lead: '给 phi-plugin 的查分图换个样子，不用写代码。',
    blocks: [
      {
        kind: 'text',
        text: '你在网页里直接改查分图的样子，改完导出一个 ZIP 压缩包，丢进 phi-plugin 就能用。全程不需要懂 CSS。',
      },
      {
        kind: 'steps',
        items: [
          { label: '中间', text: '查分图的预览，最后出图就是这个样子。上方可以切 B19 / B27 / B30 / B33 / 数据分析。' },
          { label: '左边', text: '找元素的地方。列出了画面上所有能改的部件，可以搜索。' },
          { label: '右边', text: '改东西的地方。四个页签：样式、主题、资源、导出。' },
          { label: '顶部', text: '新建、导入别人的主题包、导出你的主题包，以及撤销和缩放。' },
        ],
      },
      { kind: 'tip', text: '改动会自动存在你的浏览器里，关掉网页再打开还在。换电脑或换浏览器则不会同步。' },
    ],
  },
  {
    id: 'select',
    nav: '第 1 步',
    title: '选中你想改的东西',
    lead: '先选中，右边才会显示它的设置。',
    blocks: [
      {
        kind: 'steps',
        items: [
          { label: '方法一', text: '直接在中间的预览图上点你想改的东西，比如点一下歌名。' },
          { label: '方法二', text: '在左栏「组件」的搜索框里输名字，比如「曲名」「头像」「分数」，点搜索结果。' },
        ],
      },
      {
        kind: 'text',
        text: '选中后，右边「样式」页签最上面会显示它叫什么，下面一行灰色小字是它的层级路径。',
      },
      {
        kind: 'tip',
        text: '点歪了很常见。比如你想选整块「玩家信息栏」，却选中了里面的「玩家 ID 文字」。这时点那行路径里靠前的一段，就能选回外层的框。',
      },
    ],
  },
  {
    id: 'edit',
    nav: '第 2 步',
    title: '把它改成你想要的样子',
    lead: '挪位置、改大小、换颜色，都在这一步。',
    blocks: [
      {
        kind: 'steps',
        items: [
          { label: '挪位置', text: '选中后直接用鼠标拖。想微调就按方向键，一次 1 像素，按住 Shift 一次 10 像素。' },
          { label: '改大小', text: '拖选中框四周那 8 个小方块。' },
          { label: '改颜色、字号', text: '在右边「样式」面板里改。颜色点一下色块会弹出取色器。' },
        ],
      },
      {
        kind: 'text',
        text: '样式面板里每个设置项下面都有一行灰色的「默认」，那是这个元素现在的实际数值，只是给你参考，不填也不会影响导出。',
      },
      {
        kind: 'tip',
        text: '改坏了不要紧。右上角有撤销按钮；想把某个元素完全恢复原样，点它「样式」页签顶部那个写着「N 项覆盖」的按钮就能一键清空。',
      },
    ],
  },
  {
    id: 'assets',
    nav: '第 3 步',
    title: '换背景、字体和图标',
    lead: '这些不在样式面板里，在右边另外两个页签。',
    blocks: [
      {
        kind: 'steps',
        items: [
          { label: '「资源」页签', text: '换背景图、换字体、换 9 个评级图标（phi、FC、V、S、A、B、C、F、NEW）。点上传按钮选文件即可，换完预览会立刻变。' },
          { label: '「主题」页签', text: '填主题名称、ID、作者、说明，以及 AT / IN / HD / EZ 四个难度的颜色。' },
        ],
      },
      {
        kind: 'text',
        text: 'ID 是这个主题的身份证，只能用小写字母、数字、减号和下划线，之后在 QQ 里就是用它来切换主题的。',
      },
      { kind: 'tip', text: '单个文件别超过 20 MB。背景图建议先压一下，太大会让机器人出图变慢。' },
    ],
  },
  {
    id: 'export',
    nav: '第 4 步',
    title: '导出并装进 phi-plugin',
    lead: '最后一步，拿到 ZIP 装上去。',
    blocks: [
      {
        kind: 'steps',
        items: [
          { label: '1', text: '点右边「导出」页签，看一下检查清单，全是绿色勾就没问题。有红色叉要先按提示改。' },
          { label: '2', text: '点「导出 ZIP」，浏览器会下载一个压缩包。' },
          { label: '3', text: '把压缩包解压到 phi-plugin 的 resources/html/b19/themes/ 目录里。' },
          { label: '4', text: '在 QQ 里发指令切换主题，把命令里的 ID 换成你自己填的那个。' },
        ],
      },
      { kind: 'code', text: '/myset 主题 你的主题ID' },
      {
        kind: 'tip',
        text: '解压后目录结构应该是 themes/你的主题ID/info.yaml，如果多套了一层文件夹，插件会找不到。',
      },
    ],
  },
  {
    id: 'faq',
    nav: '常见问题',
    title: '几个容易困惑的地方',
    lead: '遇到下面这些情况都属于正常。',
    blocks: [
      {
        kind: 'qa',
        items: [
          {
            label: '导出的 b19.css 只有几行？',
            text: '正常。默认只保存你改动过的部分，其余样式沿用插件自带的，这样插件更新时你的主题能跟着受益。想要一份完整的样式表，在「导出」页签把形态切到「自包含模式」。',
          },
          {
            label: '找不到某个元素？',
            text: '有些东西只在特定情况下才出现，比如平均 ACC、无成绩占位、版本提示。在预览图上方点「可选元素」，把它勾上就会显示在画布里，然后就能正常选中和修改。',
          },
          {
            label: '难度颜色没写进 CSS？',
            text: '正常。颜色、字体、背景是记在 info.yaml 里的，插件出图时会自己读取，不需要写进样式表。',
          },
          {
            label: '想从别人的主题改起？',
            text: '点顶部「导入」，选一个主题 ZIP，就能在他的基础上继续改。',
          },
        ],
      },
    ],
  },
]
