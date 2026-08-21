import { AlertTriangle, Check, Code2, Download, FileArchive, X } from 'lucide-react'
import type { ValidationIssue } from '../types/theme'

interface PackagePanelProps {
  issues: ValidationIssue[]
  assetCount: number
  customTemplate: boolean
  onSource: () => void
  onExport: () => void
}

const issueIcon = {
  success: Check,
  warning: AlertTriangle,
  error: X,
}

export function PackagePanel({
  issues,
  assetCount,
  customTemplate,
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
          <span>{assetCount} 个资源 · {customTemplate ? '模板覆盖' : '内置模板'} · 页面 CSS 覆盖层</span>
        </div>
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
