import { useEffect, useRef } from 'react'
import type { Editor } from 'grapesjs'
import { createPhiEditor, type EditorUploadedAsset } from '../editor/createEditor'

interface GrapesCanvasProps {
  onReady: (editor: Editor) => void
  onDispose: (editor: Editor) => void
  onUpdate: () => void
  onZoomChange: (zoom: number) => void
  onAssetUpload: (files: File[]) => Promise<EditorUploadedAsset[]>
  components?: string
  protectedCss?: string
}

export function GrapesCanvas({ onReady, onDispose, onUpdate, onZoomChange, onAssetUpload, components, protectedCss }: GrapesCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layers = document.getElementById('gjs-layer-manager')
    const styles = document.getElementById('gjs-style-manager')
    const traits = document.getElementById('gjs-trait-manager')
    if (!canvasRef.current || !layers || !styles || !traits) return
    const editor = createPhiEditor({
      container: canvasRef.current,
      layers,
      styles,
      traits,
      components,
      protectedCss,
      onReady,
      onUpdate,
      onAssetUpload,
    })
    let frame = 0
    let loaded = false
    const fit = () => {
      if (!loaded) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        editor.Canvas.fitViewport({ gap: 28, zoom: (value) => Math.min(value, 80) })
        onZoomChange(Math.round(editor.Canvas.getZoom()))
      })
    }
    const refresh = () => {
      if (!loaded) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => editor.Canvas.refresh({ all: true }))
    }
    editor.on('load', () => {
      loaded = true
      fit()
    })
    editor.on('phi:custom:drop', onUpdate)
    const observer = new ResizeObserver(refresh)
    observer.observe(canvasRef.current)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      editor.off('phi:custom:drop', onUpdate)
      onDispose(editor)
      editor.destroy()
    }
  }, [onReady, onDispose, onUpdate, onZoomChange, onAssetUpload, components, protectedCss])

  return <div ref={canvasRef} className="gjs-canvas-host" data-testid="editor-canvas" />
}
