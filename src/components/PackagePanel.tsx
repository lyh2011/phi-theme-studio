import { AlertTriangle, Check, Code2, Download, FileArchive, X } from 'lucide-react'
import { EXPORT_MODES, type ExportMode, type ValidationIssue } from '../types/theme'

interface PackagePanelProps {
  issues: ValidationIssue[]
  assetCount: number
  customTemplate: boolean
  exportMode: ExportMode
  onExportModeChange: (mode: ExportMode) => void
  onSource: () => void
  onExport: () => void
}

const issueIcon = {
  success: Check,
  warning: AlertTriangle,
  error: X,
}

const MODE_COPY: Record<ExportMode, { label: string; hint: string }> = {
  override: {
    label: '覆盖模式',
    hint: 'B19 只导出改动并引用插件基础样式；其它页面导出独立覆盖层，可跟随上游修复',
  },
  standalone: {
    label: '自包含模式',
    hint: '把 B19 基础样式写进主题包；其它页面仍使用独立覆盖层，不改写插件模板',
  },
}

export function PackagePanel({
  issues,
  assetCount,
  customTemplate,
  exportMode,
  onExportModeChange,
  onSource,
  onExport,
}: PackagePanelProps) {
  const hasErrors = issues.some((issue) => issue.level === 'error')
  return (
    <div className="package-panel">
      <section className="package-summary">
        <FileArchive size={24} aria-hidden="true" />
        <div>
          <strong>phi-plugin 主题包</strong>
          <span>{assetCount} 个资源 · {customTemplate ? '模板覆盖' : '内置模板'} · {MODE_COPY[exportMode].label}</span>
        </div>
      </section>

      <section className="form-section export-mode">
        <h2>样式表形态</h2>
        {EXPORT_MODES.map((mode) => (
          <label key={mode} className={exportMode === mode ? 'active' : ''}>
            <input
              type="radio"
              name="phi-export-mode"
              value={mode}
              checked={exportMode === mode}
              onChange={() => onExportModeChange(mode)}
            />
            <span className="export-mode-dot" aria-hidden="true" />
            <span className="export-mode-text">
              <strong>{MODE_COPY[mode].label}</strong>
              <em>{MODE_COPY[mode].hint}</em>
            </span>
          </label>
        ))}
      </section>

      <section className="validation-list">
        <h2>导出检查</h2>
        {issues.map((issue, index) => {
          const Icon = issueIcon[issue.level]
          return (
            <div className={`validation-item is-${issue.level}`} key={`${issue.message}-${index}`}>
              <Icon size={15} aria-hidden="true" />
              <span>{issue.message}</span>
            </div>
          )
        })}
      </section>

      <div className="package-actions">
        <button type="button" className="secondary-command" onClick={onSource}>
          <Code2 size={17} aria-hidden="true" />
          源码
        </button>
        <button type="button" className="primary-command" onClick={onExport} disabled={hasErrors}>
          <Download size={17} aria-hidden="true" />
          导出 ZIP
        </button>
      </div>
    </div>
  )
}
