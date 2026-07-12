import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ImageIcon,
  Layers,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { api } from '../api/client'
import { ScheduleGanttChart } from './ScheduleGanttChart'
import type { InspectionSchedule, OverviewStats } from '../types'

type OverviewPanelProps = {
  stats: OverviewStats | null
  loading: boolean
}

function healthLabel(score: number): string {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Needs attention'
  return 'At risk'
}

function healthTone(score: number): string {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'watch'
  return 'risk'
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function activityIcon(kind?: string) {
  if (kind === 'request') return ClipboardList
  if (kind === 'training') return Sparkles
  if (kind === 'upload') return ImageIcon
  return Activity
}

export function OverviewPanel({ stats, loading }: OverviewPanelProps) {
  const [schedules, setSchedules] = useState<InspectionSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)

  useEffect(() => {
    setSchedulesLoading(true)
    api
      .getInspectionSchedules()
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setSchedulesLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <section className="overview-panel overview-panel-loading">
        <div className="overview-hero skeleton-hero" />
        <div className="overview-kpi-row">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="overview-kpi-card skeleton-card" />
          ))}
        </div>
      </section>
    )
  }

  const maxStatusCount = Math.max(...stats.statusBreakdown.map((item) => item.count), 1)
  const maxFindingCount = Math.max(...stats.topFindings.map((item) => item.count), 1)
  const generatedAt = formatTimestamp(stats.generatedAt)

  return (
    <section className="overview-panel">
      <header className="overview-hero">
        <div className="overview-hero-copy">
          <span className="overview-eyebrow">Executive dashboard</span>
          <h2>Grid Inspection Program</h2>
          <p>{stats.executiveSummary}</p>
        </div>

        <div className={`overview-health-ring tone-${healthTone(stats.healthScore)}`}>
          <div className="overview-health-score">
            <strong>{stats.healthScore}</strong>
            <span>Health score</span>
          </div>
          <span className="overview-health-label">{healthLabel(stats.healthScore)}</span>
        </div>
      </header>

      <div className="overview-kpi-row">
        <article className="overview-kpi-card">
          <div className="overview-kpi-icon tone-blue">
            <Target size={18} />
          </div>
          <div>
            <strong>{stats.complianceRate}%</strong>
            <span>Fleet compliance</span>
            <small>{stats.clearImages} of {stats.totalImages} images clear</small>
          </div>
        </article>

        <article className="overview-kpi-card">
          <div className="overview-kpi-icon tone-indigo">
            <Layers size={18} />
          </div>
          <div>
            <strong>{stats.inspectionCoverage}%</strong>
            <span>Inspection coverage</span>
            <small>{stats.labeledImages} images with AI labels</small>
          </div>
        </article>

        <article className="overview-kpi-card">
          <div className="overview-kpi-icon tone-red">
            <AlertTriangle size={18} />
          </div>
          <div>
            <strong>{stats.criticalImages}</strong>
            <span>Critical findings</span>
            <small>{stats.warningImages} items flagged for review</small>
          </div>
        </article>

        <article className="overview-kpi-card">
          <div className="overview-kpi-icon tone-amber">
            <ClipboardList size={18} />
          </div>
          <div>
            <strong>{stats.openServiceRequests}</strong>
            <span>Open work orders</span>
            <small>
              {stats.emergencyServiceRequests} emergency · {stats.urgentServiceRequests} urgent
            </small>
          </div>
        </article>
      </div>

      <div className="overview-main-grid">
        <article className="overview-card-panel">
          <div className="overview-card-head">
            <h3>Fleet risk posture</h3>
            <span>By inspection outcome</span>
          </div>
          <div className="overview-bar-chart">
            {stats.statusBreakdown.map((item) => (
              <div key={item.status} className={`overview-bar-row status-${item.status}`}>
                <span className="overview-bar-label">{item.label}</span>
                <div className="overview-bar-track">
                  <div
                    className="overview-bar-fill"
                    style={{ width: `${(item.count / maxStatusCount) * 100}%` }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="overview-card-panel">
          <div className="overview-card-head">
            <h3>Top defect categories</h3>
            <span>Across all annotations</span>
          </div>
          {stats.topFindings.length === 0 ? (
            <p className="overview-empty">No labeled findings yet.</p>
          ) : (
            <div className="overview-bar-chart">
              {stats.topFindings.map((item) => (
                <div key={item.label} className="overview-bar-row">
                  <span className="overview-bar-label" title={item.label}>
                    {item.label}
                  </span>
                  <div className="overview-bar-track">
                    <div
                      className="overview-bar-fill findings"
                      style={{ width: `${(item.count / maxFindingCount) * 100}%` }}
                    />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="overview-card-panel overview-metrics-panel">
          <div className="overview-card-head">
            <h3>Program metrics</h3>
            <span>Operational snapshot</span>
          </div>
          <dl className="overview-metrics-list">
            <div>
              <dt>
                <MapPinned size={14} />
                Assets monitored
              </dt>
              <dd>{stats.assets}</dd>
            </div>
            <div>
              <dt>
                <ImageIcon size={14} />
                Images in program
              </dt>
              <dd>{stats.totalImages}</dd>
            </div>
            <div>
              <dt>
                <Layers size={14} />
                AI annotations
              </dt>
              <dd>{stats.totalAnnotations}</dd>
            </div>
            <div>
              <dt>
                <CheckCircle2 size={14} />
                Uploaded captures
              </dt>
              <dd>{stats.uploadedImages}</dd>
            </div>
            <div>
              <dt>
                <Sparkles size={14} />
                Active model training
              </dt>
              <dd>{stats.activeTrainingJobs}</dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={14} />
                Risk items resolved
              </dt>
              <dd>{stats.clearImages}</dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="overview-card-panel overview-activity-panel">
        <div className="overview-gantt-wrap">
          <ScheduleGanttChart schedules={schedules} loading={schedulesLoading} />
        </div>

        <div className="overview-card-head">
          <h3>Recent program activity</h3>
          <time dateTime={stats.generatedAt}>Updated {generatedAt}</time>
        </div>
        {stats.recentActivity.length === 0 ? (
          <p className="overview-empty">No recent activity recorded.</p>
        ) : (
          <ul className="overview-timeline">
            {stats.recentActivity.map((item) => {
              const Icon = activityIcon(item.kind)
              return (
                <li key={item.id}>
                  <div className={`overview-timeline-icon kind-${item.kind ?? 'default'}`}>
                    <Icon size={15} />
                  </div>
                  <div className="overview-timeline-body">
                    <strong>{item.message}</strong>
                    <span>{formatTimestamp(item.at)}</span>
                  </div>
                  {item.priority && (
                    <span className={`overview-priority priority-${item.priority}`}>
                      {item.priority}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </section>
  )
}
