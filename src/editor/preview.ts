import commonCss from '../theme/common-preview.css?raw'
import baseB19Css from '../theme/base-b19.css?raw'
import type { PackageAsset, RatingKey, ThemeDraft, ThemeResources } from '../types/theme'

const demoAssetUrl = (path: string) => `${import.meta.env.BASE_URL}demo/${path}`

const songs = [
  ['P1', 'Luminescence', 'IN', '15.8', '16.31', 'phi', '1000000', '100.00', '01'],
  ['P2', 'Stasis', 'AT', '16.7', '16.55', 'FC', '998741', '99.91', '02'],
  ['P3', 'Distorted Fate', 'IN', '15.7', '16.42', 'V', '992806', '99.76', '03'],
  ['#1', 'DESTRUCTION 3,2,1', 'AT', '17.3', '16.80', 'S', '957285', '99.33', '04'],
  ['#2', 'Retribution', 'IN', '16.5', '16.28', 'V', '981768', '99.62', '05'],
  ['#3', 'Chronostasis', 'AT', '16.4', '16.15', 'S', '963044', '99.08', '06'],
  ['#4', 'Bounded Quietude', 'IN', '16.3', '16.10', 'V', '996571', '99.76', '01'],
  ['#5', 'Artificial Existence', 'HD', '15.9', '15.92', 'A', '916947', '97.94', '02'],
  ['#6', 'Energy Synergy Matrix', 'EZ', '15.4', '15.41', 'FC', '987620', '99.88', '03'],
  ['#7', 'Indelible Scar', 'AT', '16.2', '16.02', 'V', '977803', '99.29', '04'],
  ['#8', 'Class Memories', 'IN', '16.1', '15.98', 'S', '943552', '99.43', '05'],
  ['#9', 'Snow Desert', 'HD', '15.8', '15.76', 'FC', '990826', '99.34', '06'],
  ['#10', 'Bonus Time', 'IN', '15.9', '15.71', 'V', '970373', '99.33', '01'],
  ['#11', 'Sparkle New Life', 'EZ', '15.6', '15.52', 'B', '881204', '96.84', '02'],
  ['#12', 'Winter Cube', 'AT', '16.0', '15.49', 'C', '817450', '94.65', '03'],
] as const

function stripPreviewImports(css: string) {
  return css
    .replace(/@import\s+[^;]+;/g, '')
    .replace(/@font-face\s*{[^}]*}/g, '')
}

function songCard(song: (typeof songs)[number], index: number) {
  const [number, title, rank, difficulty, rks, rating, score, acc, cover] = song
  const kind = index < 3 ? 'phi_song' : index < 6 ? 'b_song' : ''
  return `
    <div class="song ${kind}" data-gjs-name="成绩卡 ${number}" data-phi-role="song-card">
      <div class="ill-box" data-gjs-name="曲绘区域">
        <div class="num clip-box" data-gjs-name="成绩序号"><p>${number}</p></div>
        <div class="ill clip-box" data-gjs-name="曲绘"><img src="${demoAssetUrl(`covers/${cover}.png`)}" alt="${title}"></div>
        <div class="rank-${rank} clip-box" data-gjs-name="难度标签 ${rank}">
          <div class="org"><p>${rank}&ensp;${difficulty}</p></div>
          <div class="rel"><p>${rks}</p></div>
        </div>
      </div>
      <div class="info-${rank}" data-gjs-name="成绩信息 ${rank}">
        <div class="songname" data-gjs-name="曲名"><p>${title}</p></div>
        <div class="songinfo" data-gjs-name="分数信息">
          <div class="Rating" data-gjs-name="评级图标">
            <img data-rating="${rating}" src="${demoAssetUrl(`rating/${rating}.png`)}" alt="${rating}">
          </div>
          <div class="chengji">
            <div class="score"><p>${score}</p></div>
            <div class="line"></div>
            <div class="acc-box">
              <div class="acc"><p>${acc}%</p></div>
              <div class="suggest suggest-kind-${index % 6}"><div class="suggest-tip"></div><p>${index % 2 ? '99.82%' : '无法推分'}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>`
}

export const PREVIEW_MARKUP = `
  <div class="background" data-gjs-name="主题背景" data-phi-role="background">
    <img src="${demoAssetUrl('background.png')}" alt="主题背景">
  </div>
  <div class="title" data-gjs-name="玩家信息栏" data-phi-role="header">
    <div class="playerInfo" data-gjs-name="玩家资料">
      <div class="blackBlock clip-box"></div>
      <div class="avatar clip-box"><img src="${demoAssetUrl('avatar.png')}" alt="头像"></div>
      <div class="playerId"><p>PHI DESIGNER</p></div>
      <div class="rks clip-box"><p>16.0963</p></div>
      <div class="clgBox"><div class="Challenge"><img src="${demoAssetUrl('challenge.png')}" alt="课题模式"><p>48</p></div></div>
      <div class="date"><p>2026/08/11 19:01:58</p></div>
      <div class="dataBox clip-box"><img src="${demoAssetUrl('data.png')}" alt="Data"><p>377MiB 674KiB</p></div>
    </div>
    <div class="recordInfo clip-box" data-gjs-name="成绩统计">
      <div class="whiteLine clip-box"></div>
      <div class="sheet">
        <div class="row"><div class="poz"><p>\\</p></div><div class="poz"><p>EZ</p></div><div class="poz"><p>HD</p></div><div class="poz"><p>IN</p></div><div class="poz"><p>AT</p></div></div>
        <div class="row"><div class="poz"><p>C</p></div><div class="poz"><p>66</p></div><div class="poz"><p>67</p></div><div class="poz"><p>205</p></div><div class="poz"><p>36</p></div></div>
        <div class="row"><div class="poz"><p>FC</p></div><div class="poz"><p>10</p></div><div class="poz"><p>13</p></div><div class="poz"><p>39</p></div><div class="poz"><p>3</p></div></div>
        <div class="row"><div class="poz"><p>Phi</p></div><div class="poz"><p>3</p></div><div class="poz"><p>1</p></div><div class="poz"><p>11</p></div><div class="poz"><p>1</p></div></div>
      </div>
    </div>
  </div>
  <div class="b19" data-gjs-name="B30 成绩网格" data-phi-role="score-grid">
    ${songs.map(songCard).join('')}
  </div>
  <div class="over_flow" data-gjs-name="分隔标题">
    <div class="flow_line_box_l">${'<div class="flow_line"></div>'.repeat(6)}</div>
    <p><i>OVER FLOW</i></p>
    <div class="flow_line_box_r">${'<div class="flow_line"></div>'.repeat(6)}</div>
  </div>
  <div class="createdbox" data-gjs-name="页脚" data-phi-role="footer">
    <div class="phi-plugin"><p>Phi-Plugin</p></div><div class="ver"><p> v1.0.2</p></div>
  </div>`

const previewOnlyCss = `
html { background: #171a1d; }
body { min-height: 1120px; overflow: hidden; }
.background { min-height: 1120px; }
.createdbox { margin-top: 4%; margin-bottom: 4%; }
.createdbox p { font-size: 48px; }
`

export const PROTECTED_CSS = `${stripPreviewImports(commonCss)}\n${stripPreviewImports(baseB19Css)}\n${previewOnlyCss}`

export function applyRuntimePreview(
  document: Document,
  draft: ThemeDraft,
  resources: ThemeResources,
  assets: PackageAsset[],
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
    :root { --AT: ${draft.colors.AT}; --IN: ${draft.colors.IN}; --HD: ${draft.colors.HD}; --EZ: ${draft.colors.EZ}; }
    ${font ? `@font-face { font-family: "phi-theme-preview"; src: url(${JSON.stringify(font)}); } body { font-family: "phi-theme-preview", "PHI", sans-serif; }` : ''}
  `
}
