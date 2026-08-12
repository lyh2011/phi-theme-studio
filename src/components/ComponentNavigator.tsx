import type { Editor } from 'grapesjs'
import { BarChart3, Image, LayoutGrid, Medal, PanelTop, Type } from 'lucide-react'

const targets = [
  { label: '玩家信息', selector: '.title', icon: PanelTop },
  { label: '成绩网格', selector: '.b19', icon: LayoutGrid },
  { label: '成绩卡', selector: '.song', icon: BarChart3 },
  { label: '曲绘区域', selector: '.ill-box', icon: Image },
  { label: '评级图标', selector: '.Rating', icon: Medal },
  { label: '曲名文字', selector: '.songname', icon: Type },
] as const

export function ComponentNavigator({ editor }: { editor: Editor | null }) {
  const select = (selector: string) => {
    const component = editor?.getWrapper()?.find(selector)[0]
    if (!editor || !component) return
    editor.select(component)
    editor.Canvas.scrollTo(component, { behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="component-nav">
      {targets.map(({ label, selector, icon: Icon }) => (
        <button key={selector} type="button" onClick={() => select(selector)} disabled={!editor}>
          <Icon size={17} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
