import { useMemo, type CSSProperties } from 'react'
import type { InspectionSchedule, InspectionSchedulePriority, InspectionScheduleStatus } from '../types'

type ScheduleGanttChartProps = {
  schedules: InspectionSchedule[]
  loading?: boolean
  selectedAssetId?: string | null
  onSelectAsset?: (assetId: string) => void
}

type GanttSegment = {
  id: string
  start: Date
  end: Date
  status: InspectionScheduleStatus
  projected?: boolean
}

type GanttRow = {
  scheduleId: string
  assetId: string
  label: string
  sublabel: string
  segments: GanttSegment[]
  empty?: boolean
}

const WINDOW_WEEKS = 1
const TIMELINE_MONTHS = 4
const LABEL_COL_WIDTH = 240
const TOP_SCHEDULE_COUNT = 5

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7)
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date) {
  const day = startOfDay(date)
  const weekday = day.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  return addDays(day, diff)
}

function formatAxisDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTooltipDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function scheduleRank(schedule: InspectionSchedule): number {
  if (schedule.status === 'overdue') return 0
  if (schedule.status === 'scheduled' && schedule.priority === 'urgent') return 1
  if (schedule.status === 'scheduled') return 2
  if (schedule.status === 'completed') return 3
  return 4
}

function rankSchedules(schedules: InspectionSchedule[]): InspectionSchedule[] {
  return [...schedules]
    .filter((schedule) => schedule.status !== 'cancelled')
    .sort((a, b) => {
      const rankDiff = scheduleRank(a) - scheduleRank(b)
      if (rankDiff !== 0) return rankDiff
      return parseDate(a.scheduledAt).getTime() - parseDate(b.scheduledAt).getTime()
    })
}

function priorityLabel(priority: InspectionSchedulePriority): string {
  return priority === 'urgent' ? 'Urgent' : 'Routine'
}

function padRows(rows: GanttRow[]): GanttRow[] {
  const padded = [...rows]
  while (padded.length < TOP_SCHEDULE_COUNT) {
    padded.push({
      scheduleId: `empty-${padded.length}`,
      assetId: '',
      label: 'No schedule assigned',
      sublabel: 'Open slot',
      segments: [],
      empty: true,
    })
  }
  return padded
}

function clipSegment(segment: GanttSegment, rangeStart: Date, rangeEnd: Date): GanttSegment | null {
  const start = segment.start < rangeStart ? rangeStart : segment.start
  const end = segment.end > rangeEnd ? rangeEnd : segment.end
  if (end <= start) return null
  return { ...segment, start, end }
}

function buildSegments(
  schedule: InspectionSchedule,
  today: Date,
  rangeStart: Date,
  rangeEnd: Date,
): GanttSegment[] {
  const due = parseDate(schedule.scheduledAt)
  const windowStart = addWeeks(due, -WINDOW_WEEKS)
  const segments: GanttSegment[] = []

  if (schedule.status === 'completed') {
    const end = schedule.completedAt ? parseDate(schedule.completedAt) : due
    const clipped = clipSegment(
      {
        id: `${schedule.id}-done`,
        start: windowStart,
        end,
        status: 'completed',
      },
      rangeStart,
      rangeEnd,
    )
    return clipped ? [clipped] : []
  }

  if (schedule.status === 'cancelled') {
    return segments
  }

  if (schedule.status === 'overdue') {
    const clipped = clipSegment(
      {
        id: `${schedule.id}-current`,
        start: windowStart,
        end: today,
        status: 'overdue',
      },
      rangeStart,
      rangeEnd,
    )
    if (clipped) segments.push(clipped)
    return segments
  }

  const current = clipSegment(
    {
      id: `${schedule.id}-current`,
      start: windowStart,
      end: due,
      status: schedule.status,
    },
    rangeStart,
    rangeEnd,
  )
  if (current) segments.push(current)

  const frequency = schedule.frequencyDays
  if (!frequency || frequency < 1) {
    return segments
  }

  let nextDue = addDays(due, frequency)
  let index = 0
  while (nextDue <= rangeEnd) {
    const projected = clipSegment(
      {
        id: `${schedule.id}-future-${index}`,
        start: addWeeks(nextDue, -WINDOW_WEEKS),
        end: nextDue,
        status: 'scheduled',
        projected: true,
      },
      rangeStart,
      rangeEnd,
    )
    if (projected) segments.push(projected)
    nextDue = addDays(nextDue, frequency)
    index += 1
  }

  return segments
}

function buildRows(
  schedules: InspectionSchedule[],
  today: Date,
  rangeStart: Date,
  rangeEnd: Date,
): GanttRow[] {
  const rows: GanttRow[] = []

  for (const schedule of rankSchedules(schedules)) {
    if (rows.length >= TOP_SCHEDULE_COUNT) break
    const segments = buildSegments(schedule, today, rangeStart, rangeEnd)
    if (segments.length === 0) continue
    rows.push({
      scheduleId: schedule.id,
      assetId: schedule.assetId,
      label: schedule.assetName ?? 'Unknown asset',
      sublabel: priorityLabel(schedule.priority),
      segments,
    })
  }

  rows.sort((a, b) => {
    const aStart = a.segments[0]?.start.getTime() ?? 0
    const bStart = b.segments[0]?.start.getTime() ?? 0
    return aStart - bStart
  })

  return padRows(rows)
}

function buildWeeklyAxisTicks(rangeStart: Date, rangeEnd: Date) {
  const ticks: Date[] = []
  let cursor = startOfWeek(rangeStart)
  while (cursor <= rangeEnd) {
    ticks.push(new Date(cursor))
    cursor = addWeeks(cursor, 1)
  }
  if (ticks[ticks.length - 1]?.getTime() !== rangeEnd.getTime()) {
    ticks.push(rangeEnd)
  }
  return ticks
}

function tickAlignment(index: number, total: number): 'start' | 'center' | 'end' {
  if (index === 0) return 'start'
  if (index === total - 1) return 'end'
  return 'center'
}

export function ScheduleGanttChart({
  schedules,
  loading,
  selectedAssetId,
  onSelectAsset,
}: ScheduleGanttChartProps) {
  const today = startOfDay(new Date())

  const { rows, rangeStart, rangeEnd, todayOffset } = useMemo(() => {
    const rangeStart = startOfWeek(today)
    const rangeEnd = addMonths(today, TIMELINE_MONTHS)
    const rows = buildRows(schedules, today, rangeStart, rangeEnd)
    const totalMs = rangeEnd.getTime() - rangeStart.getTime()
    const todayOffset = Math.min(
      100,
      Math.max(0, ((today.getTime() - rangeStart.getTime()) / totalMs) * 100),
    )

    return { rows, rangeStart, rangeEnd, todayOffset }
  }, [schedules, today])

  const axisTicks = useMemo(
    () => buildWeeklyAxisTicks(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  )

  const totalMs = rangeEnd.getTime() - rangeStart.getTime()

  const segmentStyle = (segment: GanttSegment) => {
    const left = ((segment.start.getTime() - rangeStart.getTime()) / totalMs) * 100
    const width = Math.max(
      ((segment.end.getTime() - segment.start.getTime()) / totalMs) * 100,
      0.8,
    )
    return { left: `${left}%`, width: `${width}%` }
  }

  if (loading) {
    return (
      <section className="schedule-gantt">
        <p className="schedule-empty-hint">Loading timeline…</p>
      </section>
    )
  }

  return (
    <section className="schedule-gantt">
      <header className="schedule-gantt-header">
        <div>
          <h3>Schedule timeline</h3>
          <span>
            Top {TOP_SCHEDULE_COUNT} schedules · {formatAxisDate(rangeStart)} –{' '}
            {formatAxisDate(rangeEnd)} · {WINDOW_WEEKS}-week inspection windows
          </span>
        </div>
        <div className="schedule-gantt-legend">
          <span>
            <i className="gantt-swatch status-overdue" /> Overdue
          </span>
          <span>
            <i className="gantt-swatch status-scheduled" /> Scheduled
          </span>
          <span>
            <i className="gantt-swatch status-completed" /> Completed
          </span>
          <span>
            <i className="gantt-swatch projected" /> Projected recurrence
          </span>
        </div>
      </header>

      <div
        className="schedule-gantt-chart"
        style={{ '--gantt-label-width': `${LABEL_COL_WIDTH}px` } as CSSProperties}
      >
        <div className="schedule-gantt-labels">
          <div className="schedule-gantt-corner">Asset</div>
          {rows.map((row) =>
            row.empty ? (
              <div key={row.scheduleId} className="schedule-gantt-label schedule-gantt-label-empty">
                <strong>{row.label}</strong>
                <span>{row.sublabel}</span>
              </div>
            ) : (
              <button
                key={row.scheduleId}
                type="button"
                className={`schedule-gantt-label${row.assetId === selectedAssetId ? ' selected' : ''}`}
                onClick={() => onSelectAsset?.(row.assetId)}
              >
                <strong>{row.label}</strong>
                <span>{row.sublabel}</span>
              </button>
            ),
          )}
        </div>

        <div className="schedule-gantt-timeline">
          <div className="schedule-gantt-axis-track schedule-gantt-axis-weekly">
            {axisTicks.map((tick, index) => {
              const offset = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100
              return (
                <span
                  key={tick.toISOString()}
                  className={`tick-align-${tickAlignment(index, axisTicks.length)}`}
                  style={{ left: `${offset}%` }}
                >
                  {formatAxisDate(tick)}
                </span>
              )
            })}
          </div>

          <div className="schedule-gantt-body-area">
            <div className="schedule-gantt-grid" aria-hidden>
              {axisTicks.map((tick) => {
                const offset = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100
                return (
                  <span
                    key={`grid-${tick.toISOString()}`}
                    className="schedule-gantt-grid-line"
                    style={{ left: `${offset}%` }}
                  />
                )
              })}
            </div>

            <div className="schedule-gantt-rows">
            {rows.map((row) => (
              <div
                key={row.scheduleId}
                className={`schedule-gantt-row${row.assetId === selectedAssetId ? ' selected' : ''}${row.empty ? ' empty' : ''}`}
              >
                <div className="schedule-gantt-track">
                  {!row.empty && (
                    <span
                      className="schedule-gantt-today"
                      style={{ left: `${todayOffset}%` }}
                      aria-hidden
                    />
                  )}
                  {row.segments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      className={`schedule-gantt-bar status-${segment.status}${segment.projected ? ' projected' : ''}`}
                      style={segmentStyle(segment)}
                      title={`${formatTooltipDate(segment.start)} – ${formatTooltipDate(segment.end)}`}
                      onClick={() => onSelectAsset?.(row.assetId)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
