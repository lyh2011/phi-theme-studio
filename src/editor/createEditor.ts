import grapesjs, { type Component, type Editor } from 'grapesjs'
import { PREVIEW_MARKUP, PROTECTED_CSS } from './preview'

interface CreateEditorOptions {
  container: HTMLElement
  layers: HTMLElement
  styles: HTMLElement
  traits: HTMLElement
  onReady: (editor: Editor) => void
  onUpdate: () => void
}

function lockComponent(component: Component) {
  // Only class-backed nodes can produce selectors that exist in the runtime b19.art.
  const hasRuntimeSelector = component.getClasses().length > 0
  component.set({
    draggable: false,
    droppable: false,
    removable: false,
    copyable: false,
    editable: false,
    selectable: hasRuntimeSelector,
    hoverable: hasRuntimeSelector,
    stylable: hasRuntimeSelector,
  })
  component.components().forEach(lockComponent)
}

export function lockEditorDocument(editor: Editor) {
  const wrapper = editor.getWrapper()
  if (wrapper) lockComponent(wrapper)
}

export function createPhiEditor(options: CreateEditorOptions) {
  const editor = grapesjs.init({
    container: options.container,
    height: '100%',
    width: 'auto',
    fromElement: false,
    storageManager: false,
    telemetry: false,
    noticeOnUnload: false,
    showToolbar: false,
    showOffsets: true,
    protectedCss: PROTECTED_CSS,
    components: PREVIEW_MARKUP,
    style: '',
    panels: { defaults: [] },
    selectorManager: { componentFirst: false },
    layerManager: { appendTo: options.layers },
    traitManager: { appendTo: options.traits },
    styleManager: {
      appendTo: options.styles,
      clearProperties: true,
      sectors: [
        {
          id: 'phi-layout',
          name: '布局',
          open: true,
          properties: [
            { property: 'display', name: '显示' },
            { property: 'position', name: '定位' },
            { property: 'width', name: '宽度' },
            { property: 'height', name: '高度' },
            { property: 'top', name: '上' },
            { property: 'right', name: '右' },
            { property: 'bottom', name: '下' },
            { property: 'left', name: '左' },
            { property: 'margin', name: '外边距' },
            { property: 'padding', name: '内边距' },
            { property: 'gap', name: '间距' },
            { property: 'flex-direction', name: '排列方向' },
            { property: 'justify-content', name: '主轴对齐' },
            { property: 'align-items', name: '交叉轴对齐' },
          ],
        },
        {
          id: 'phi-typography',
          name: '文字',
          open: false,
          properties: [
            { property: 'color', name: '颜色' },
            { property: 'font-size', name: '字号' },
            { property: 'font-weight', name: '字重' },
            { property: 'line-height', name: '行高' },
            { property: 'text-align', name: '对齐' },
            { property: 'text-shadow', name: '文字阴影' },
          ],
        },
        {
          id: 'appearance',
          name: '外观',
          open: true,
          properties: [
            { property: 'background-color', name: '背景色' },
            { property: 'border', name: '边框' },
            { property: 'border-radius', name: '圆角' },
            { property: 'box-shadow', name: '阴影' },
            { property: 'opacity', name: '透明度' },
            { property: 'overflow', name: '溢出' },
          ],
        },
        {
          id: 'effects',
          name: '效果',
          open: false,
          properties: [
            { property: 'transform', name: '变换' },
            { property: 'filter', name: '滤镜' },
            { property: 'backdrop-filter', name: '背景滤镜' },
            { property: 'clip-path', name: '裁切路径' },
          ],
        },
      ],
    },
    deviceManager: {
      default: 'phi-1200',
      devices: [{ id: 'phi-1200', name: 'Phi 1200', width: '1200px', height: '1120px' }],
    },
    parser: {
      optionsHtml: {
        allowScripts: false,
        allowUnsafeAttr: false,
        allowUnsafeAttrValue: false,
      },
    },
  })

  editor.on('load', () => {
    lockEditorDocument(editor)
    editor.Canvas.fitViewport({ gap: 28, zoom: (zoom) => Math.min(zoom, 80) })
    const firstCard = editor.getWrapper()?.find('[data-phi-role="song-card"]')[0]
    if (firstCard) editor.select(firstCard)
    options.onReady(editor)
  })
  editor.on('update', options.onUpdate)
  return editor
}

export function resetEditorDocument(editor: Editor, css = '') {
  editor.setComponents(PREVIEW_MARKUP)
  editor.setStyle(css)
  lockEditorDocument(editor)
  editor.UndoManager.clear()
  editor.Canvas.fitViewport({ gap: 28, zoom: (zoom) => Math.min(zoom, 80) })
}
