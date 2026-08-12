import type { Editor } from 'grapesjs'
import type { DragEvent } from 'react'
import {
  BarChart3,
  ChartColumnBig,
  Circle,
  Grid3X3,
  Image,
  LayoutGrid,
  ListOrdered,
  Minus,
  Medal,
  PanelBottom,
  PanelTop,
  Radar,
  Square,
  Tags,
  Type,
  Triangle,
  Upload,
} from 'lucide-react'
import type { PreviewPage } from '../editor/preview'
import {
  findVisibleRuntimeComponent,
  getRuntimeSelector,
  PHI_COMPONENT_DRAG_TYPE,
  PHI_CUSTOM_ELEMENT_DRAG_TYPE,
} from '../editor/createEditor'
import type { CustomElementKind } from '../editor/customElements'

interface NavigatorTarget {
  label: string
  selector: string
  icon: typeof PanelTop
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
      { label: '玩家信息', selector: '.title', icon: PanelTop },
      { label: '成绩网格', selector: '.b19', icon: LayoutGrid },
      { label: '成绩统计', selector: '.recordInfo', icon: Grid3X3 },
      { label: '页脚', selector: '.createdbox', icon: PanelBottom },
    ],
  },
  {
    id: 'score',
    label: '成绩组件',
    targets: [
      { label: '成绩卡', selector: '.song', icon: BarChart3 },
      { label: '曲绘区域', selector: '.ill-box', icon: Image },
      { label: '评级图标', selector: '.Rating', icon: Medal },
      { label: '曲名文字', selector: '.songname p', icon: Type },
    ],
  },
]

const analysisGroups: NavigatorGroup[] = [
  {
    id: 'analysis',
    label: '数据分析',
    targets: [
      { label: '分析区域', selector: '.b30-analysis-row', icon: LayoutGrid },
      { label: '能力雷达', selector: '.tag-radar', icon: Radar },
      { label: '标签排行', selector: '.tag-ranking-column', icon: ListOrdered },
      { label: '擅长词条', selector: '.strong-tags', icon: Tags },
      { label: '薄弱词条', selector: '.weak-tags', icon: Tags },
      { label: 'RKS 直方图', selector: '.histogram-panel', icon: ChartColumnBig },
      { label: '直方图柱组', selector: '.histogram-bars', icon: BarChart3 },
      { label: '平均 RKS 线', selector: '.average-marker', icon: ChartColumnBig },
    ],
  },
]

const overflowGroup: NavigatorGroup = {
  id: 'overflow',
  label: 'Overflow',
  targets: [{ label: 'Overflow 标题', selector: '[data-phi-overflow]', icon: PanelBottom }],
}

function groupsForPage(page: PreviewPage) {
  if (page === 'analysis') return [...sharedGroups, ...analysisGroups]
  if (page === 'b33') return [...sharedGroups, overflowGroup]
  return sharedGroups
}

interface ComponentNavigatorProps {
  editor: Editor | null
  page: PreviewPage
  onSelect: (label: string) => void
  onAddCustom: (kind: Exclude<CustomElementKind, 'image'>) => void
  onUploadCustomImage: () => void
}

export function ComponentNavigator({ editor, page, onSelect, onAddCustom, onUploadCustomImage }: ComponentNavigatorProps) {
  const select = (selector: string, label: string) => {
    if (!editor) return
    const components = editor.getWrapper()?.find(selector) || []
    const component = components.find((candidate) => {
      const element = candidate.getEl()
      return element && !element.closest('[data-phi-preview-hidden]')
    })
    if (!component) return
    editor.select(component)
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
      {groupsForPage(page).map((group) => (
        <section className="component-nav-group" key={group.id}>
          <h2>{group.label}</h2>
          <div className="component-nav-grid">
            {group.targets.map(({ label, selector, icon: Icon }) => (
              <button
                key={selector}
                type="button"
                draggable={Boolean(editor)}
                onClick={() => select(selector, label)}
                onDragStart={(event) => startDrag(event, selector, label)}
                disabled={!editor}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
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
              draggable={Boolean(editor)}
              disabled={!editor}
              onClick={() => onAddCustom(kind)}
              onDragStart={(event) => startCustomDrag(event, kind)}
              title={`添加或拖放${label}`}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button type="button" disabled={!editor} onClick={onUploadCustomImage} title="上传图片到画布">
            <Upload size={17} aria-hidden="true" />
            <span>上传图片</span>
          </button>
        </div>
      </section>
    </nav>
  )
}
