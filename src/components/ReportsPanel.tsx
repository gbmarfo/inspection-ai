import { FileText, Plus } from 'lucide-react'
import type { InspectionReport } from '../types'

type ReportsPanelProps = {
  reports: InspectionReport[]
  loading: boolean
  generating: boolean
  onGenerate: () => void
}

export function ReportsPanel({ reports, loading, generating, onGenerate }: ReportsPanelProps) {
  if (loading) {
    return <section className="placeholder-panel"><p>Loading reports…</p></section>
  }

  return (
    <section className="reports-panel">
      <header className="panel-header">
        <div>
          <h2>Reports</h2>
          <p>Generate inspection summaries from the current dataset and annotation findings.</p>
        </div>
        <button type="button" className="upload-btn" disabled={generating} onClick={onGenerate}>
          <Plus size={16} />
          {generating ? 'Generating…' : 'Generate Report'}
        </button>
      </header>

      <div className="reports-list">
        {reports.length === 0 ? (
          <article className="models-card empty-report">
            <FileText size={28} />
            <p>No reports yet. Generate one from the current inspection dataset.</p>
          </article>
        ) : (
          reports.map((report) => (
            <article key={report.id} className="report-card">
              <div className="report-card-head">
                <FileText size={18} />
                <div>
                  <strong>{report.title}</strong>
                  <span>{new Date(report.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p>{report.summary}</p>
              <div className="report-metrics">
                <span className="status-pill status-critical">{report.criticalCount} critical</span>
                <span className="status-pill status-info">{report.imageCount} images</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
