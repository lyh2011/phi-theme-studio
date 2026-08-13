import commonCss from '../theme/common-preview.css?raw'
import baseB19Css from '../theme/base-b19.css?raw'
import { DIFFICULTY_COLOR_CSS } from '../lib/difficultyColors'
import type { PackageAsset, RatingKey, ThemeDraft, ThemeResources } from '../types/theme'

export const PREVIEW_PAGES = [
  { id: 'b19', label: 'B19' },
  { id: 'b27', label: 'B27' },
  { id: 'b30', label: 'B30' },
  { id: 'b33', label: 'B33 / Overflow' },
  { id: 'analysis', label: 'B30 数据分析' },
] as const

export type PreviewPage = (typeof PREVIEW_PAGES)[number]['id']
export const DEFAULT_PREVIEW_PAGE: PreviewPage = 'analysis'

export const PREVIEW_PAGE_HEIGHTS: Record<PreviewPage, number> = {
  // Values include the header, all score rows, analysis panels and footer.
  // Keeping a little breathing room here prevents the iframe viewport from
  // clipping the last text baseline at common font sizes.
  b19: 1220,
  b27: 1460,
  b30: 1590,
  b33: 1900,
  analysis: 1960,
}

const demoAssetUrl = (path: string) => `${import.meta.env.BASE_URL}demo/${path}`
const defaultFontUrl = () => `${import.meta.env.BASE_URL}font/phi.ttf`

const songSeeds = [
  ['Luminescence', 'IN', '15.8', '16.31', 'phi', '1000000', '100.00', '01'],
  ['Stasis', 'AT', '16.7', '16.55', 'FC', '998741', '99.91', '02'],
  ['Distorted Fate', 'IN', '15.7', '16.42', 'V', '992806', '99.76', '03'],
  ['DESTRUCTION 3,2,1', 'AT', '17.3', '16.80', 'S', '957285', '99.33', '04'],
  ['Retribution', 'IN', '16.5', '16.28', 'V', '981768', '99.62', '05'],
  ['Chronostasis', 'AT', '16.4', '16.15', 'S', '963044', '99.08', '06'],
  ['Bounded Quietude', 'IN', '16.3', '16.10', 'V', '996571', '99.76', '01'],
  ['Artificial Existence', 'HD', '15.9', '15.92', 'A', '916947', '97.94', '02'],
  ['Energy Synergy Matrix', 'EZ', '15.4', '15.41', 'FC', '987620', '99.88', '03'],
  ['Indelible Scar', 'AT', '16.2', '16.02', 'V', '977803', '99.29', '04'],
  ['Class Memories', 'IN', '16.1', '15.98', 'S', '943552', '99.43', '05'],
  ['Snow Desert', 'HD', '15.8', '15.76', 'FC', '990826', '99.34', '06'],
] as const

const semantic = (name: string, selector: string) => (
  `data-gjs-name="${name}" data-phi-selector="${selector}"`
)

function songCard(index: number) {
  const seed = songSeeds[index % songSeeds.length]
  const [title, rank, difficulty, rks, rating, score, acc, cover] = seed
  const phi = index < 3
  const bestIndex = index - 2
  const number = phi ? `P${index + 1}` : `#${bestIndex}`
  const kind = phi ? 'phi_song' : bestIndex <= 27 ? 'b_song' : ''
  const repeated = index >= songSeeds.length ? ` ${Math.floor(index / songSeeds.length) + 1}` : ''
  return `
    <div class="song ${kind}" ${semantic(`成绩卡 ${number}`, '.song')} data-phi-role="song-card" data-phi-slot="${phi ? 'phi' : 'best'}" data-phi-index="${phi ? index + 1 : bestIndex}">
      <div class="ill-box" ${semantic('曲绘区域', '.ill-box')}>
        <div class="num clip-box" ${semantic('成绩序号', '.num')}><p>${number}</p></div>
        <div class="ill clip-box" ${semantic('曲绘', '.ill')}><img ${semantic('曲绘图片', '.ill img')} src="${demoAssetUrl(`covers/${cover}.png`)}" alt="${title}"></div>
        <div class="rank-${rank} clip-box" ${semantic(`难度标签 ${rank}`, `.rank-${rank}`)}>
          <div class="org" ${semantic('谱面难度', `.rank-${rank} .org`)}><p ${semantic('谱面难度文字', `.rank-${rank} .org p`)}>${rank}&ensp;${difficulty}</p></div>
          <div class="rel" ${semantic('单曲 RKS', `.rank-${rank} .rel`)}><p ${semantic('单曲 RKS 数值', `.rank-${rank} .rel p`)}>${rks}</p></div>
        </div>
      </div>
      <div class="info-${rank}" ${semantic(`成绩信息 ${rank}`, `.info-${rank}`)}>
        <div class="songname" ${semantic('曲名', '.songname')}><p ${semantic('曲名文字', '.songname p')}>${title}${repeated}</p></div>
        <div class="songinfo" ${semantic('分数信息', '.songinfo')}>
          <div class="Rating" ${semantic('评级图标', '.Rating')}>
            <img ${semantic('评级图标本体', '.Rating img')} data-rating="${rating}" src="${demoAssetUrl(`rating/${rating}.png`)}" alt="${rating}">
          </div>
          <div class="chengji" ${semantic('成绩数值', '.chengji')}>
            <div class="score" ${semantic('分数', '.score')}><p ${semantic('分数文字', '.score p')}>${score}</p></div>
            <div class="line" ${semantic('分数分隔线', '.chengji .line')}></div>
            <div class="acc-box" ${semantic('准确率区域', '.acc-box')}>
              <div class="acc" ${semantic('准确率', '.acc')}><p ${semantic('准确率文字', '.acc p')}>${acc}%</p></div>
              <div class="suggest suggest-kind-${index % 6}" ${semantic('推分建议', '.suggest')}><div class="suggest-tip" ${semantic('建议标记', '.suggest-tip')}></div><p ${semantic('推分建议文字', '.suggest p')}>${index % 2 ? '99.82%' : '无法推分'}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>`
}

const flowHeading = (title: string, attributes = '') => `
  <div class="over_flow" ${semantic(title, '.over_flow')} ${attributes}>
    <div class="flow_line_box_l" ${semantic('左侧分隔线', '.flow_line_box_l')}>${'<div class="flow_line"></div>'.repeat(6)}</div>
    <p><i>${title}</i></p>
    <div class="flow_line_box_r" ${semantic('右侧分隔线', '.flow_line_box_r')}>${'<div class="flow_line"></div>'.repeat(6)}</div>
  </div>`

const radarCategories = [
  ['节奏', 100, 8, 'middle', 100, 27, '16.48'],
  ['耐力', 187, 65, 'end', 165, 71, '16.22'],
  ['读谱', 154, 174, 'end', 143, 142, '15.94'],
  ['协调', 46, 174, 'start', 57, 142, '16.08'],
  ['精度', 13, 65, 'start', 35, 71, '16.37'],
] as const

const histogramScale = [['0', 0], ['15.0', 25], ['16.0', 50], ['17.0', 75], ['18.0', 100]] as const
const histogramHeights = [96, 91, 88, 84, 82, 79, 76, 72, 69, 67, 64, 62, 60, 57, 55, 52, 49, 47, 45, 42, 40, 37, 34, 31, 28, 25, 22, 19, 16, 12] as const

function analysisMarkup() {
  const grid = [
    '100,27 162,72 138,144 62,144 38,72',
    '100,43 146,77 128,130 72,130 54,77',
    '100,59 130,82 119,116 81,116 70,82',
  ]
  const axes = [[100, 27], [162, 72], [138, 144], [62, 144], [38, 72]]
  const strong = [['节奏爆发', '16.55'], ['高速交互', '16.42'], ['纵连处理', '16.31']] as const
  const weak = [['低速读谱', '15.76'], ['多押协调', '15.82'], ['长段耐力', '15.88']] as const
  const rankingRows = (items: readonly (readonly [string, string])[], weakRows = false) => items.map(([name, rks], index) => `
    <div class="tag-result-row" ${semantic(`${weakRows ? '薄弱' : '擅长'}词条 ${index + 1}`, '.tag-result-row')}>
      <p class="tag-rank" ${semantic('词条排名', weakRows ? '.weak-tags .tag-rank' : '.tag-rank')}>${index + 1}</p>
      <p class="tag-name" ${semantic('词条名称', '.tag-name')}>${name}</p>
      <p class="tag-rks" ${semantic('词条 RKS', '.tag-rks')}>${rks}</p>
    </div>`).join('')

  return `
    ${flowHeading('B30 数据分析', 'data-phi-analysis')}
    <div class="b30-analysis-row" ${semantic('B30 数据分析区', '.b30-analysis-row')} data-phi-analysis>
      <section class="analysis-panel tag-analysis-panel clip-box" ${semantic('谱面标签能力面板', '.tag-analysis-panel')}>
        <div class="analysis-panel-head" ${semantic('分析面板标题栏', '.analysis-panel-head')}>
          <div><p class="analysis-kicker" ${semantic('分析英文标题', '.analysis-kicker')}>CHART PROFILE</p><p class="analysis-title" ${semantic('分析标题', '.analysis-title')}>谱面标签能力</p></div>
          <p class="analysis-meta" ${semantic('分析统计信息', '.analysis-meta')}>有效票 2,816</p>
        </div>
        <div class="tag-analysis-body" ${semantic('标签分析内容', '.tag-analysis-body')}>
          <div class="tag-analysis-content" ${semantic('标签分析布局', '.tag-analysis-content')}>
            <div class="tag-radar-column" ${semantic('雷达图区域', '.tag-radar-column')}>
              <div class="tag-radar-title" ${semantic('雷达图小标题', '.tag-radar-title')}><span></span><p>分类汇总</p></div>
              <svg class="tag-radar" ${semantic('谱面能力雷达图', '.tag-radar')} viewBox="0 0 200 184" aria-label="分类标签能力雷达图">
                ${grid.map((points) => `<polygon class="tag-radar-grid" ${semantic('雷达网格', '.tag-radar-grid')} points="${points}"></polygon>`).join('')}
                ${axes.map(([x, y]) => `<line class="tag-radar-axis" ${semantic('雷达坐标轴', '.tag-radar-axis')} x1="100" y1="92" x2="${x}" y2="${y}"></line>`).join('')}
                <polygon class="tag-radar-shape" ${semantic('雷达能力区域', '.tag-radar-shape')} points="100,29 154,74 132,135 69,137 45,73"></polygon>
                ${radarCategories.map(([name, labelX, labelY, anchor, pointX, pointY, value]) => `
                  <circle class="tag-radar-point" ${semantic('雷达数据点', '.tag-radar-point')} cx="${pointX}" cy="${pointY}" r="2.3"></circle>
                  <text class="tag-radar-label" ${semantic('雷达维度名称', '.tag-radar-label')} x="${labelX}" y="${labelY}" text-anchor="${anchor}"><tspan x="${labelX}">${name}</tspan><tspan class="tag-radar-score" ${semantic('雷达维度数值', '.tag-radar-score')} x="${labelX}" dy="10">${value}</tspan></text>`).join('')}
              </svg>
            </div>
            <div class="tag-ranking-column" ${semantic('词条排行区域', '.tag-ranking-column')}>
              <div class="tag-ranking-group strong-tags" ${semantic('擅长词条组', '.strong-tags')}><div class="tag-column-title" ${semantic('词条组标题', '.tag-column-title')}><span></span><p>擅长词条</p></div>${rankingRows(strong)}</div>
              <div class="tag-ranking-group weak-tags" ${semantic('薄弱词条组', '.weak-tags')}><div class="tag-column-title" ${semantic('词条组标题', '.tag-column-title')}><span></span><p>薄弱词条</p></div>${rankingRows(weak, true)}</div>
            </div>
          </div>
        </div>
      </section>
      <section class="analysis-panel histogram-panel clip-box" ${semantic('等效 RKS 直方图面板', '.histogram-panel')}>
        <div class="analysis-panel-head" ${semantic('分析面板标题栏', '.analysis-panel-head')}>
          <div><p class="analysis-kicker" ${semantic('分析英文标题', '.analysis-kicker')}>RKS DISTRIBUTION</p><p class="analysis-title" ${semantic('分析标题', '.analysis-title')}>等效 RKS 直方图</p></div>
          <div class="histogram-summary" ${semantic('直方图摘要', '.histogram-summary')}><p>平均 RKS</p><p>16.0963</p></div>
        </div>
        <div class="histogram-chart" ${semantic('直方图绘图区', '.histogram-chart')}>
          <div class="histogram-y-label" ${semantic('直方图纵轴标题', '.histogram-y-label')}>等效单曲 RKS</div>
          <div class="histogram-plot" ${semantic('直方图坐标区', '.histogram-plot')}>
            <div class="histogram-scale" ${semantic('直方图刻度区', '.histogram-scale')}>
              ${histogramScale.map(([label]) => `<div class="histogram-grid-line" ${semantic('直方图网格线', '.histogram-grid-line')}><p>${label}</p></div>`).join('')}
              <div class="average-marker" ${semantic('平均 RKS 标记线', '.average-marker')}><p>AVG 16.0963</p></div>
            </div>
            <div class="histogram-bars" ${semantic('直方图柱组', '.histogram-bars')}>
              ${histogramHeights.map((_height, index) => `<div class="histogram-slot" ${semantic(`RKS 槽位 ${index + 1}`, '.histogram-slot')}><div class="histogram-bar-area" ${semantic('柱体区域', '.histogram-bar-area')}><div class="histogram-bar ${index < 3 ? 'phi-bar' : 'best-bar'}" ${semantic(index < 3 ? 'P1-P3 柱体' : 'B1-B27 柱体', index < 3 ? '.phi-bar' : '.best-bar')}></div></div><p class="histogram-slot-label" ${semantic('槽位标签', '.histogram-slot-label')}>${index < 3 ? `P${index + 1}` : `B${index - 2}`}</p></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="histogram-legend" ${semantic('直方图图例', '.histogram-legend')}><p><span class="legend-dot phi-dot"></span>P1-P3</p><p><span class="legend-dot best-dot"></span>B1-B27</p><p>30 个有效槽位</p></div>
      </section>
    </div>`
}

const scoreCards = Array.from({ length: 36 }, (_, index) => songCard(index))

export const PREVIEW_MARKUP = `
  <div class="background" ${semantic('主题背景', '.background')} data-phi-role="background"><img src="${demoAssetUrl('background.png')}" alt="主题背景"></div>
  <div class="title" ${semantic('玩家信息栏', '.title')} data-phi-role="header">
    <div class="playerInfo" ${semantic('玩家资料', '.playerInfo')}>
      <div class="blackBlock clip-box" ${semantic('玩家资料背景', '.blackBlock')}></div>
      <div class="avatar clip-box" ${semantic('头像', '.avatar')}><img src="${demoAssetUrl('avatar.png')}" alt="头像"></div>
      <div class="playerId" ${semantic('玩家 ID', '.playerId')}><p ${semantic('玩家 ID 文字', '.playerId p')}>PHI DESIGNER</p></div>
      <div class="rks clip-box" ${semantic('玩家 RKS', '.rks')}><p ${semantic('玩家 RKS 数值', '.rks p')}>16.0963</p></div>
      <div class="clgBox" ${semantic('课题模式区域', '.clgBox')}><div class="Challenge" ${semantic('课题模式', '.Challenge')}><img ${semantic('课题模式图标', '.Challenge img')} src="${demoAssetUrl('challenge.png')}" alt="课题模式"><p ${semantic('课题模式数字', '.Challenge p')}>48</p></div></div>
      <div class="date" ${semantic('更新时间', '.date')}><p ${semantic('更新时间文字', '.date p')}>2026/08/11 19:01:58</p></div>
      <div class="dataBox clip-box" ${semantic('Data 信息', '.dataBox')}><img ${semantic('Data 图标', '.dataBox img')} src="${demoAssetUrl('data.png')}" alt="Data"><p ${semantic('Data 文字', '.dataBox p')}>377MiB 674KiB</p></div>
    </div>
    <div class="recordInfo clip-box" ${semantic('成绩统计', '.recordInfo')}>
        <div class="whiteLine clip-box" ${semantic('统计强调线', '.whiteLine')}></div>
      <div class="sheet" ${semantic('成绩统计表', '.sheet')}>
        <div class="row"><div class="poz"><p>\\</p></div><div class="poz"><p>EZ</p></div><div class="poz"><p>HD</p></div><div class="poz"><p>IN</p></div><div class="poz"><p>AT</p></div></div>
        <div class="row"><div class="poz"><p>C</p></div><div class="poz"><p>66</p></div><div class="poz"><p>67</p></div><div class="poz"><p>205</p></div><div class="poz"><p>36</p></div></div>
        <div class="row"><div class="poz"><p>FC</p></div><div class="poz"><p>10</p></div><div class="poz"><p>13</p></div><div class="poz"><p>39</p></div><div class="poz"><p>3</p></div></div>
        <div class="row"><div class="poz"><p>Phi</p></div><div class="poz"><p>3</p></div><div class="poz"><p>1</p></div><div class="poz"><p>11</p></div><div class="poz"><p>1</p></div></div>
      </div>
    </div>
  </div>
  <div class="b19" ${semantic('成绩网格', '.b19')} data-phi-role="score-grid">
    ${scoreCards.slice(0, 30).join('')}
    ${flowHeading('OVER FLOW', 'data-phi-overflow')}
    ${scoreCards.slice(30).join('')}
  </div>
  ${analysisMarkup()}
  <div class="createdbox" ${semantic('页脚', '.createdbox')} data-phi-role="footer"><div class="phi-plugin" ${semantic('插件名称', '.phi-plugin')}><p>Phi-Plugin</p></div><div class="ver" ${semantic('插件版本', '.ver')}><p> v1.0.2</p></div></div>`

function stripPreviewImports(css: string) {
  return css
    .replace(/@import\s+[^;]+;/g, '')
    .replace(/@font-face\s*{[^}]*}/g, '')
}

const previewOnlyCss = `
@font-face { font-family: "PHI"; src: url(${JSON.stringify(defaultFontUrl())}) format("truetype"); font-display: swap; }
html { background: #171a1d; }
body { min-height: var(--phi-preview-height, 1400px); overflow: hidden; }
.background { min-height: var(--phi-preview-height, 1400px); }
[data-phi-preview-hidden] { display: none !important; }
.createdbox { margin-top: 4%; margin-bottom: 4%; }
.createdbox p { font-size: 48px; }
:where(.average-marker) { bottom: 55%; }
${histogramScale.map(([, bottom], index) => `:where(.histogram-grid-line:nth-child(${index + 1})) { bottom: ${bottom}%; }`).join('\n')}
${histogramHeights.map((height, index) => `:where(.histogram-slot:nth-child(${index + 1}) .histogram-bar) { height: ${height}%; }`).join('\n')}
`

export const PROTECTED_CSS = `${stripPreviewImports(commonCss)}\n${stripPreviewImports(baseB19Css)}\n${DIFFICULTY_COLOR_CSS}\n${previewOnlyCss}`

export function applyPreviewPage(document: Document, page: PreviewPage) {
  document.documentElement.dataset.phiPreview = page
  const showAnalysis = page === 'analysis'
  for (const element of document.querySelectorAll<HTMLElement>('[data-phi-analysis]')) {
    element.toggleAttribute('data-phi-preview-hidden', !showAnalysis)
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-phi-overflow]')) {
    element.toggleAttribute('data-phi-preview-hidden', page !== 'b33')
  }
  for (const element of document.querySelectorAll<HTMLElement>('.song[data-phi-slot]')) {
    const slot = element.dataset.phiSlot
    const index = Number(element.dataset.phiIndex)
    const visible = page === 'b19'
      ? slot === 'phi' || slot === 'best' && index <= 16
      : page === 'b27'
        ? slot === 'best' && index <= 27
        : page === 'b33'
          ? slot === 'phi' || slot === 'best' && index <= 33
          : slot === 'phi' || slot === 'best' && index <= 27
    element.toggleAttribute('data-phi-preview-hidden', !visible)
  }
}

export function applyRuntimePreview(
  document: Document,
  draft: ThemeDraft,
  resources: ThemeResources,
  assets: PackageAsset[],
  page: PreviewPage = DEFAULT_PREVIEW_PAGE,
) {
  const byPath = new Map(assets.map((asset) => [asset.path, asset]))
  const background = resources.background ? byPath.get(resources.background)?.previewUrl : undefined
  const backgroundImage = document.querySelector<HTMLImageElement>('.background img')
  if (backgroundImage) backgroundImage.src = background || demoAssetUrl('background.png')

  for (const image of document.querySelectorAll<HTMLImageElement>('[data-rating]')) {
    const rating = image.dataset.rating as RatingKey
    const custom = resources.icons[rating] ? byPath.get(resources.icons[rating] || '')?.previewUrl : undefined
    image.src = custom || demoAssetUrl(`rating/${rating}.png`)
  }

  let style = document.querySelector<HTMLStyleElement>('#phi-runtime-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'phi-runtime-theme'
    document.head.append(style)
  }
  const font = resources.font ? byPath.get(resources.font)?.previewUrl : undefined
  style.textContent = `
    html:root { --AT: ${draft.colors.AT}; --IN: ${draft.colors.IN}; --HD: ${draft.colors.HD}; --EZ: ${draft.colors.EZ}; --phi-preview-height: ${PREVIEW_PAGE_HEIGHTS[page]}px; }
    ${font ? `@font-face { font-family: "phi-theme-preview"; src: url(${JSON.stringify(font)}); } body, body * { font-family: "phi-theme-preview", "PHI", sans-serif !important; }` : ''}
  `
  applyPreviewPage(document, page)
}
