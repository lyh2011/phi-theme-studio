import { useMemo, useState } from 'react'
import type { Editor } from 'grapesjs'
import type { DragEvent } from 'react'
import {
  BarChart3,
  CalendarClock,
  ChartColumnBig,
  Circle,
  CircleUser,
  Database,
  Gauge,
  Grid3X3,
  Hash,
  Image,
  ImageOff,
  LayoutGrid,
  ListOrdered,
  Minus,
  Medal,
  PanelBottom,
  PanelTop,
  Percent,
  Radar,
  Search,
  Signal,
  Sparkles,
  Square,
  Star,
  Tag,
  Tags,
  Target,
  TrendingUp,
  Type,
  Triangle,
  Upload,
  Wallpaper,
} from 'lucide-react'
import { PREVIEW_OPTIONS, type PreviewOption, type PreviewOptions } from '../editor/preview'
import type { PreviewPage } from '../editor/preview'
import { B19_VIEW_IDS, getPageDefinition } from '../editor/pageRegistry'
import type { RenderTarget } from '../types/theme'
import {
  findVisibleRuntimeComponent,
  getRuntimeSelector,
  PHI_COMPONENT_DRAG_TYPE,
  PHI_CUSTOM_ELEMENT_DRAG_TYPE,
  selectRuntimeStyle,
} from '../editor/createEditor'
import type { CustomElementKind } from '../editor/customElements'
import { componentLabelForSelector } from '../editor/componentLabels'

interface NavigatorTarget {
  label: string
  selector: string
  icon: typeof PanelTop
  /** Preview option that must be enabled before this element exists on canvas. */
  option?: PreviewOption
}

interface NavigatorGroup {
  id: string
  label: string
  targets: NavigatorTarget[]
}

const sharedGroups: NavigatorGroup[] = [
  {
    id: 'structure',
    label: '页面结构',
    targets: [
      { label: '主题背景', selector: '.background', icon: Wallpaper },
      { label: '玩家信息', selector: '.title', icon: PanelTop },
      { label: '玩家资料', selector: '.playerInfo', icon: CircleUser },
      { label: '成绩统计表', selector: '.recordInfo', icon: Grid3X3 },
      { label: '成绩网格', selector: '.b19', icon: LayoutGrid },
      { label: '页脚', selector: '.createdbox', icon: PanelBottom },
    ],
  },
  {
    id: 'player',
    label: '玩家信息',
    targets: [
      { label: '头像', selector: '.avatar', icon: CircleUser },
      { label: '玩家 ID', selector: '.playerId', icon: Type },
      { label: '玩家昵称背景框', selector: '.blackBlock', icon: Square },
      { label: '玩家 RKS', selector: '.rks', icon: Gauge },
      { label: '课题模式', selector: '.Challenge', icon: Star },
      { label: '更新时间', selector: '.date', icon: CalendarClock },
      { label: 'Data 信息', selector: '.dataBox', icon: Database },
    ],
  },
  {
    id: 'score',
    label: '成绩组件',
    targets: [
      { label: '成绩卡', selector: '.song', icon: BarChart3 },
      { label: 'Phi 成绩卡', selector: '.phi_song', icon: Sparkles },
      { label: '曲绘区域', selector: '.ill-box', icon: Image },
      { label: '曲绘图片', selector: '.ill', icon: Image },
      { label: '难度标签', selector: '.rank-IN', icon: Tag },
      { label: '成绩序号', selector: '.num', icon: Hash },
      { label: '曲名文字', selector: '.songname p', icon: Type },
      { label: '评级图标', selector: '.Rating', icon: Medal },
      { label: '分数', selector: '.score', icon: Target },
      { label: '准确率', selector: '.acc', icon: Percent },
      { label: '推分建议', selector: '.suggest', icon: TrendingUp },
    ],
  },
  {
    id: 'conditional',
    label: '条件元素',
    targets: [
      { label: '版本提示', selector: '.spInfoBox', icon: Tag, option: 'spInfo' },
      { label: '版本提示背景', selector: '.spInfo', icon: Square, option: 'spInfo' },
      { label: '平均 ACC', selector: '.accAvg', icon: Percent, option: 'accAvg' },
      { label: '定数对比', selector: '.cpToOld', icon: TrendingUp, option: 'cpToOld' },
      { label: '无成绩占位', selector: '.Nosignal', icon: Signal, option: 'nosignal' },
    ],
  },
]

const analysisGroups: NavigatorGroup[] = [
  {
    id: 'analysis',
    label: '数据分析',
    targets: [
      { label: '分析区域', selector: '.b30-analysis-row', icon: LayoutGrid },
      { label: '标签面板', selector: '.tag-analysis-panel', icon: Tags },
      { label: '能力雷达', selector: '.tag-radar', icon: Radar },
      { label: '标签排行', selector: '.tag-ranking-column', icon: ListOrdered },
      { label: '擅长词条', selector: '.strong-tags', icon: Tags },
      { label: '薄弱词条', selector: '.weak-tags', icon: Tags },
      { label: '投票提示', selector: '.tag-analysis-tip', icon: Tag },
      { label: '数据不足提示', selector: '.tag-insufficient-message', icon: ImageOff, option: 'tagInsufficient' },
      { label: 'RKS 直方图', selector: '.histogram-panel', icon: ChartColumnBig },
      { label: '直方图柱组', selector: '.histogram-bars', icon: BarChart3 },
      { label: '平均 RKS 线', selector: '.average-marker', icon: ChartColumnBig },
    ],
  },
]

const overflowGroup: NavigatorGroup = {
  id: 'overflow',
  label: '溢出区域',
  targets: [{ label: '溢出提示', selector: '[data-phi-overflow]', icon: PanelBottom }],
}

function groupsForPage(page: PreviewPage | RenderTarget) {
  if ((B19_VIEW_IDS as readonly string[]).includes(page)) {
    if (page === 'analysis') return [...sharedGroups, ...analysisGroups]
    if (page === 'b33') return [...sharedGroups, overflowGroup]
    return sharedGroups
  }
  const definition = getPageDefinition(page)
  if (!definition) return sharedGroups
  return definition.selectorGroups.map((group) => ({
    id: group.id,
    label: group.label,
    targets: group.selectors.map((selector) => ({
      label: componentLabelForSelector(selector, definition.markup, group.label),
      selector,
      icon: selector.includes('img') ? Image : selector.includes('title') ? Type : LayoutGrid,
    })),
  }))
}

const OPTION_LABELS = new Map(PREVIEW_OPTIONS.map(({ id, label }) => [id, label]))

function unavailableReason(target: NavigatorTarget, options: PreviewOptions) {
  if (!target.option || options[target.option]) return ''
  return `请先在“可选元素”中开启${OPTION_LABELS.get(target.option) || target.option}`
}

interface ComponentNavigatorProps {
  editor: Editor | null
  page: PreviewPage | RenderTarget
  previewOptions: PreviewOptions
  customElementsEnabled?: boolean
  onSelect: (label: string) => void
  onAddCustom: (kind: Exclude<CustomElementKind, 'image'>) => void
  onUploadCustomImage: () => void
}

export function ComponentNavigator({
  editor,
  page,
  previewOptions,
  customElementsEnabled = true,
  onSelect,
  onAddCustom,
  onUploadCustomImage,
}: ComponentNavigatorProps) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const pageGroups = groupsForPage(page)
    const keyword = query.trim().toLowerCase()
    if (!keyword) return pageGroups
    const matches = pageGroups
      .flatMap((group) => group.targets)
      .filter((target) => (
        target.label.toLowerCase().includes(keyword) || target.selector.toLowerCase().includes(keyword)
      ))
    return [{ id: 'search', label: `搜索结果 · ${matches.length}`, targets: matches }]
  }, [page, query])

  const select = (selector: string, label: string) => {
    if (!editor) return
    const component = findVisibleRuntimeComponent(editor, selector)
    if (!component) return
    editor.select(component)
    selectRuntimeStyle(editor, component)
    onSelect(label)
    editor.Canvas.scrollTo(component, { behavior: 'smooth', block: 'center', force: true })
  }

  const startDrag = (event: DragEvent<HTMLButtonElement>, selector: string, label: string) => {
    if (!editor) return
    const component = findVisibleRuntimeComponent(editor, selector)
    const runtimeSelector = getRuntimeSelector(component)
    if (!component || !runtimeSelector) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(PHI_COMPONENT_DRAG_TYPE, runtimeSelector)
    event.dataTransfer.setData('text/plain', runtimeSelector)
    editor.select(component)
    selectRuntimeStyle(editor, component)
    onSelect(label)
  }

  const startCustomDrag = (event: DragEvent<HTMLButtonElement>, kind: Exclude<CustomElementKind, 'image'>) => {
    if (!editor) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(PHI_CUSTOM_ELEMENT_DRAG_TYPE, kind)
    event.dataTransfer.setData('text/plain', kind)
  }

  return (
    <nav className="component-nav" aria-label="当前页面组件">
      <div className="component-search">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="搜索元素或选择器"
          aria-label="搜索元素或选择器"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {groups.map((group) => (
        <section className="component-nav-group" key={group.id}>
          <h2>{group.label}</h2>
          {group.targets.length === 0 && <p className="component-nav-empty">当前预览页面没有匹配的元素。</p>}
          <div className="component-nav-grid">
            {group.targets.map((target) => {
              const { label, selector, icon: Icon } = target
              const reason = unavailableReason(target, previewOptions)
              return (
                <button
                  key={selector}
                  type="button"
                  draggable={Boolean(editor) && !reason}
                  onClick={() => select(selector, label)}
                  onDragStart={(event) => startDrag(event, selector, label)}
                  disabled={!editor || Boolean(reason)}
                  title={reason || selector}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <section className="component-nav-group custom-nav-group">
        <h2>自定义元素</h2>
        <div className="component-nav-grid">
          {([
            ['text', '文字', Type],
            ['rect', '矩形', Square],
            ['circle', '圆形', Circle],
            ['triangle', '三角形', Triangle],
            ['line', '线条', Minus],
          ] as const).map(([kind, label, Icon]) => (
            <button
              key={kind}
              type="button"
              draggable={Boolean(editor) && customElementsEnabled}
              disabled={!editor || !customElementsEnabled}
              onClick={() => onAddCustom(kind)}
              onDragStart={(event) => startCustomDrag(event, kind)}
              title={`添加或拖放${label}`}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button type="button" disabled={!editor || !customElementsEnabled} onClick={onUploadCustomImage} title="上传图片到画布">
            <Upload size={17} aria-hidden="true" />
            <span>上传图片</span>
          </button>
        </div>
      </section>
    </nav>
  )
}
