import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, MapPin } from 'lucide-react'
import { api } from '../api/client'
import { AssetsMap } from './AssetsMap'
import type { Asset, InspectionSchedule, InspectionSchedulePriority } from '../types'

type SchedulePanelProps = {
  assets: Asset[]
  loading: boolean
  onAssetsChanged: () => void | Promise<void>
}

type ScheduleFilter = 'all' | 'overdue' | 'scheduled' | 'unscheduled'

function formatDate(value?: string) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function SchedulePanel({ assets, loading, onAssetsChanged }: SchedulePanelProps) {
  const [schedules, setSchedules] = useState<InspectionSchedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ScheduleFilter>('all')
  const [scheduleDate, setScheduleDate] = useState('')
  const [schedulePriority, setSchedulePriority] = useState<InspectionSchedulePriority>('routine')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [frequencyDays, setFrequencyDays] = useState('180')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadSchedules = async () => {
    setSchedulesLoading(true)
    try {
      const next = await api.getInspectionSchedules()
      setSchedules(next)
    } finally {
      setSchedulesLoading(false)
    }
  }

  useEffect(() => {
    void loadSchedules()
  }, [])

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return assets
    if (filter === 'overdue') {
      return assets.filter((asset) => asset.inspectionStatus === 'overdue')
    }
    if (filter === 'scheduled') {
      return assets.filter((asset) => asset.inspectionStatus === 'scheduled')
    }
    return assets.filter((asset) => !asset.inspectionStatus || asset.inspectionStatus === 'none')
  }, [assets, filter])

  const stats = useMemo(
    () => ({
      overdue: assets.filter((asset) => asset.inspectionStatus === 'overdue').length,
      scheduled: assets.filter((asset) => asset.inspectionStatus === 'scheduled').length,
      unscheduled: assets.filter((asset) => !asset.inspectionStatus || asset.inspectionStatus === 'none').length,
    }),
    [assets],
  )

  const upcomingSchedules = useMemo(
    () =>
      schedules.filter((schedule) => schedule.status === 'scheduled' || schedule.status === 'overdue'),
    [schedules],
  )

  const handleSelectAsset = (assetId: string) => {
    setSelectedAssetId(assetId)
    setMessage(null)
    const asset = assets.find((item) => item.id === assetId)
    if (asset?.nextInspectionAt) {
      setScheduleDate(asset.nextInspectionAt.slice(0, 10))
    }
  }

  const handleSchedule = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAssetId || !scheduleDate) return

    setSaving(true)
    setMessage(null)
    try {
      await api.createInspectionSchedule({
        assetId: selectedAssetId,
        scheduledAt: scheduleDate,
        priority: schedulePriority,
        notes: scheduleNotes || undefined,
        frequencyDays: frequencyDays ? Number(frequencyDays) : undefined,
      })
      setScheduleNotes('')
      setMessage(`Inspection scheduled for ${selectedAsset?.name ?? 'asset'}.`)
      await Promise.all([loadSchedules(), onAssetsChanged()])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to schedule inspection')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async (scheduleId: string) => {
    await api.updateInspectionSchedule(scheduleId, { status: 'completed' })
    await Promise.all([loadSchedules(), onAssetsChanged()])
  }

  if (loading) {
    return (
      <section className="placeholder-panel">
        <p>Loading schedule…</p>
      </section>
    )
  }

  return (
    <section className="schedule-panel">
      <header className="schedule-panel-header">
        <div>
          <h2>Inspection Schedule</h2>
          <p>
            Select assets on the map to plan inspections. Pin colors show overdue, scheduled, and
            unscheduled assets across the fleet.
          </p>
        </div>
        <div className="schedule-kpi-row">
          <article className="schedule-kpi tone-red">
            <AlertTriangle size={16} />
            <strong>{stats.overdue}</strong>
            <span>Overdue</span>
          </article>
          <article className="schedule-kpi tone-amber">
            <CalendarClock size={16} />
            <strong>{stats.scheduled}</strong>
            <span>Scheduled</span>
          </article>
          <article className="schedule-kpi tone-slate">
            <MapPin size={16} />
            <strong>{stats.unscheduled}</strong>
            <span>Unscheduled</span>
          </article>
        </div>
      </header>

      <div className="schedule-workspace">
        <div className="schedule-map-column">
          <div className="schedule-filter-bar">
            {(['all', 'overdue', 'scheduled', 'unscheduled'] as ScheduleFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                className={filter === option ? 'active' : undefined}
                onClick={() => setFilter(option)}
              >
                {option === 'all' ? 'All assets' : option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <AssetsMap
            assets={filteredAssets}
            selectedId={selectedAssetId}
            onSelect={handleSelectAsset}
            className="schedule-map"
          />
        </div>

        <aside className="schedule-side-panel">
          <section className="schedule-card">
            <div className="schedule-card-head">
              <h3>Upcoming inspections</h3>
              <span>{upcomingSchedules.length} active</span>
            </div>
            {schedulesLoading ? (
              <p className="schedule-empty-hint">Loading schedule…</p>
            ) : upcomingSchedules.length === 0 ? (
              <p className="schedule-empty-hint">No upcoming inspections scheduled.</p>
            ) : (
              <ul className="schedule-upcoming-list">
                {upcomingSchedules.map((schedule) => (
                  <li key={schedule.id}>
                    <button
                      type="button"
                      className={schedule.assetId === selectedAssetId ? 'active' : undefined}
                      onClick={() => handleSelectAsset(schedule.assetId)}
                    >
                      <div>
                        <strong>{schedule.assetName}</strong>
                        <span>{formatDate(schedule.scheduledAt)}</span>
                      </div>
                      <span className={`schedule-pill status-${schedule.status}`}>{schedule.status}</span>
                    </button>
                    <button
                      type="button"
                      className="card-btn schedule-complete-btn"
                      onClick={() => void handleComplete(schedule.id)}
                      title="Mark complete"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="schedule-card">
            <h3>Selected asset</h3>
            {selectedAsset ? (
              <>
                <div className="schedule-selected-asset">
                  <strong>{selectedAsset.name}</strong>
                  <span>{selectedAsset.type}</span>
                  <span>
                    <MapPin size={13} />
                    {selectedAsset.lat.toFixed(4)}, {selectedAsset.lng.toFixed(4)}
                  </span>
                  <span className={`schedule-pill status-${selectedAsset.inspectionStatus ?? 'none'}`}>
                    {(selectedAsset.inspectionStatus ?? 'none').replace('_', ' ')}
                  </span>
                  <span>Next: {formatDate(selectedAsset.nextInspectionAt)}</span>
                </div>

                <form className="schedule-form" onSubmit={handleSchedule}>
                  <label>
                    <span>Inspection date</span>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Priority</span>
                    <select
                      value={schedulePriority}
                      onChange={(event) =>
                        setSchedulePriority(event.target.value as InspectionSchedulePriority)
                      }
                    >
                      <option value="routine">Routine</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label>
                    <span>Repeat every (days)</span>
                    <input
                      type="number"
                      min={30}
                      step={30}
                      value={frequencyDays}
                      onChange={(event) => setFrequencyDays(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Notes</span>
                    <textarea
                      value={scheduleNotes}
                      onChange={(event) => setScheduleNotes(event.target.value)}
                      rows={3}
                      placeholder="Crew instructions or inspection scope"
                    />
                  </label>
                  <button type="submit" className="card-btn primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Schedule inspection'}
                  </button>
                </form>
                {message && <p className="schedule-message">{message}</p>}
              </>
            ) : (
              <p className="schedule-empty-hint">
                Click a timeline row, map pin, or upcoming item to select an asset and schedule an
                inspection.
              </p>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}
