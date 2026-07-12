import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleDot,
  ClipboardList,
  Clock,
  ImageIcon,
  MapPin,
  MapPinned,
  Plus,
  Search,
} from 'lucide-react'
import type { ServiceRequest, ServiceRequestStatus } from '../types'
import { priorityLabel, statusLabel } from '../utils/serviceRequests'

type ServiceRequestsPanelProps = {
  requests: ServiceRequest[]
  loading: boolean
  creating: boolean
  onBulkCreate: () => void
  onUpdateStatus: (id: string, status: ServiceRequestStatus) => void
  onOpenImage: (request: ServiceRequest) => void
  onViewOnMap: (request: ServiceRequest) => void
}

type SortColumn =
  | 'title'
  | 'location'
  | 'priority'
  | 'severity'
  | 'sla'
  | 'raised'
  | 'status'

type SortDirection = 'asc' | 'desc'

const STATUS_OPTIONS: ServiceRequestStatus[] = ['open', 'scheduled', 'in_progress', 'closed']
const STATUS_FILTERS: (ServiceRequestStatus | 'all')[] = [
  'all',
  'open',
  'scheduled',
  'in_progress',
  'closed',
]

const PRIORITY_ORDER = { emergency: 0, urgent: 1, routine: 2 } as const
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const
const STATUS_ORDER = { open: 0, scheduled: 1, in_progress: 2, closed: 3 } as const

const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'title', label: 'Request' },
  { key: 'location', label: 'Location' },
  { key: 'priority', label: 'Priority' },
  { key: 'severity', label: 'Severity' },
  { key: 'sla', label: 'SLA' },
  { key: 'raised', label: 'Raised' },
  { key: 'status', label: 'Status' },
]

function slaText(slaDays: number): string {
  return slaDays === 1 ? '24 hours' : `${slaDays} days`
}

function requestCode(id: string): string {
  return `SR-${id.replace(/^sr-/, '').toUpperCase()}`
}

function compareRequests(
  a: ServiceRequest,
  b: ServiceRequest,
  column: SortColumn,
  direction: SortDirection,
): number {
  let result = 0
  switch (column) {
    case 'title':
      result = a.title.localeCompare(b.title)
      break
    case 'location':
      result = (a.imageName ?? a.imageId).localeCompare(b.imageName ?? b.imageId)
      break
    case 'priority':
      result = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      break
    case 'severity':
      result = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      break
    case 'sla':
      result = a.slaDays - b.slaDays
      break
    case 'raised':
      result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      break
    case 'status':
      result = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      break
  }
  return direction === 'asc' ? result : -result
}

export function ServiceRequestsPanel({
  requests,
  loading,
  creating,
  onBulkCreate,
  onUpdateStatus,
  onOpenImage,
  onViewOnMap,
}: ServiceRequestsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<ServiceRequestStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('raised')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const metrics = useMemo(() => {
    const open = requests.filter((request) => request.status !== 'closed')
    return {
      total: requests.length,
      open: open.length,
      emergency: open.filter((request) => request.priority === 'emergency').length,
      urgent: open.filter((request) => request.priority === 'urgent').length,
      closed: requests.filter((request) => request.status === 'closed').length,
    }
  }, [requests])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) return false
      if (!q) return true
      return (
        request.title.toLowerCase().includes(q) ||
        request.classification.toLowerCase().includes(q) ||
        (request.imageName ?? request.imageId).toLowerCase().includes(q) ||
        requestCode(request.id).toLowerCase().includes(q)
      )
    })
    return [...matches].sort((a, b) => compareRequests(a, b, sortColumn, sortDirection))
  }, [requests, statusFilter, query, sortColumn, sortDirection])

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'raised' ? 'desc' : 'asc')
  }

  const sortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown size={12} className="sr-sort-icon muted" />
    return sortDirection === 'asc' ? (
      <ArrowUp size={12} className="sr-sort-icon active" />
    ) : (
      <ArrowDown size={12} className="sr-sort-icon active" />
    )
  }

  if (loading) {
    return (
      <section className="placeholder-panel">
        <p>Loading service requests…</p>
      </section>
    )
  }

  return (
    <section className="service-requests-panel">
      <header className="sr-header">
        <div className="sr-header-text">
          <h2>Service Requests</h2>
          <p>
            Field work orders generated from inspection findings. Priority and response SLA are set
            automatically from annotation severity.
          </p>
        </div>
        <button type="button" className="sr-primary-btn" disabled={creating} onClick={onBulkCreate}>
          <Plus size={16} />
          {creating ? 'Creating…' : 'Create High / Critical'}
        </button>
      </header>

      <div className="sr-metrics">
        <article className="sr-metric">
          <div className="sr-metric-icon tone-slate">
            <ClipboardList size={18} />
          </div>
          <div>
            <strong>{metrics.total}</strong>
            <span>Total requests</span>
          </div>
        </article>
        <article className="sr-metric">
          <div className="sr-metric-icon tone-blue">
            <CircleDot size={18} />
          </div>
          <div>
            <strong>{metrics.open}</strong>
            <span>Open</span>
          </div>
        </article>
        <article className="sr-metric">
          <div className="sr-metric-icon tone-red">
            <AlertTriangle size={18} />
          </div>
          <div>
            <strong>{metrics.emergency}</strong>
            <span>Emergency</span>
          </div>
        </article>
        <article className="sr-metric">
          <div className="sr-metric-icon tone-amber">
            <Clock size={18} />
          </div>
          <div>
            <strong>{metrics.urgent}</strong>
            <span>Urgent</span>
          </div>
        </article>
      </div>

      <div className="sr-toolbar">
        <div className="sr-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by ID, title, asset…"
            aria-label="Search service requests"
          />
        </div>
        <div className="sr-filter-group" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              className={`sr-filter${statusFilter === status ? ' active' : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : statusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="sr-empty">
          <ClipboardList size={30} />
          <p>
            {requests.length === 0
              ? 'No service requests yet. Select an annotation in AI Processing to raise one, or bulk-create for all High / Critical findings.'
              : 'No requests match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="sr-table-wrap">
          <table className="sr-table">
            <thead>
              <tr>
                {SORT_COLUMNS.map((column) => (
                  <th key={column.key}>
                    <button
                      type="button"
                      className={`sr-sort-btn${sortColumn === column.key ? ' active' : ''}`}
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      {sortIcon(column.key)}
                    </button>
                  </th>
                ))}
                <th className="sr-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request) => (
                <tr key={request.id}>
                  <td>
                    <div className="sr-cell-title">
                      <span className={`sr-priority-bar priority-${request.priority}`} aria-hidden />
                      <div>
                        <strong>{request.title}</strong>
                        <span className="sr-code">{requestCode(request.id)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="sr-cell-location">
                      <MapPin size={13} />
                      {request.imageName ?? request.imageId}
                    </div>
                  </td>
                  <td>
                    <span className={`sr-badge priority-${request.priority}`}>
                      {priorityLabel(request.priority)}
                    </span>
                  </td>
                  <td>
                    <span className={`sr-badge severity-${request.severity.toLowerCase()}`}>
                      {request.severity}
                    </span>
                  </td>
                  <td className="sr-sla">{slaText(request.slaDays)}</td>
                  <td className="sr-date">
                    {new Date(request.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    <select
                      className={`sr-status-select status-${request.status}`}
                      value={request.status}
                      onChange={(event) =>
                        onUpdateStatus(request.id, event.target.value as ServiceRequestStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="sr-row-actions">
                      <button
                        type="button"
                        className="sr-action-btn"
                        title="Open image in AI Processing"
                        aria-label={`Open image for ${request.title}`}
                        onClick={() => onOpenImage(request)}
                      >
                        <ImageIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="sr-action-btn"
                        title="View on map"
                        aria-label={`View ${request.title} on map`}
                        onClick={() => onViewOnMap(request)}
                      >
                        <MapPinned size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
