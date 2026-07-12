import { useEffect, useState } from 'react'
import { ClipboardList, Trash2 } from 'lucide-react'
import { CLASSIFICATIONS, SEVERITIES, type BoundingBox, type Severity } from '../types'
import { SEVERITY_COLORS } from '../utils/annotations'
import { priorityFromSeverity, priorityLabel } from '../utils/serviceRequests'

const severityClass: Record<Severity, string> = {
  Low: 'severity-low',
  Medium: 'severity-medium',
  High: 'severity-high',
  Critical: 'severity-critical',
}

type VideoAnnotationEditorProps = {
  box: BoundingBox
  onSave: (
    annotationId: string,
    patch: { classification?: string; severity?: Severity; label?: string },
  ) => void | Promise<void>
  onDelete: (annotationId: string) => void | Promise<void>
  onClose: () => void
  onCreateServiceRequest?: (annotationId: string) => void | Promise<void>
}

export function VideoAnnotationEditor({
  box,
  onSave,
  onDelete,
  onClose,
  onCreateServiceRequest,
}: VideoAnnotationEditorProps) {
  const [classification, setClassification] = useState(box.classification ?? box.label ?? CLASSIFICATIONS[0])
  const [severity, setSeverity] = useState<Severity>(box.severity ?? 'Medium')
  const [creatingRequest, setCreatingRequest] = useState(false)
  const [requestCreated, setRequestCreated] = useState(false)

  useEffect(() => {
    setClassification(box.classification ?? box.label ?? CLASSIFICATIONS[0])
    setSeverity(box.severity ?? 'Medium')
    setRequestCreated(false)
  }, [box])

  const requestMeta = priorityFromSeverity(severity)
  const classificationOptions = CLASSIFICATIONS.includes(
    classification as (typeof CLASSIFICATIONS)[number],
  )
    ? [...CLASSIFICATIONS]
    : [classification, ...CLASSIFICATIONS]

  const save = () => {
    const patch: { classification?: string; severity?: Severity; label?: string } = {}
    if (classification !== (box.classification ?? box.label)) {
      patch.classification = classification
      patch.label = classification
    }
    if (severity !== box.severity) {
      patch.severity = severity
    }
    if (Object.keys(patch).length) {
      void onSave(box.id, patch)
    }
    onClose()
  }

  const remove = () => {
    if (!box.aiGenerated) {
      void onDelete(box.id)
    }
    onClose()
  }

  const createServiceRequest = async () => {
    if (!onCreateServiceRequest || creatingRequest) return
    setCreatingRequest(true)
    try {
      await onCreateServiceRequest(box.id)
      setRequestCreated(true)
    } finally {
      setCreatingRequest(false)
    }
  }

  return (
    <div className="buzz-popup video-annotation-popup">
      {box.aiGenerated ? (
        <span className="buzz-popup-ai">AI</span>
      ) : (
        <span className="buzz-popup-user">Manual</span>
      )}

      <div
        className="buzz-popup-title"
        style={{ backgroundColor: SEVERITY_COLORS[severity] }}
        title={`${classification} · ${severity}`}
      >
        {classification}
      </div>

      <label className="buzz-field">
        <select value={classification} onChange={(event) => setClassification(event.target.value)}>
          {classificationOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="buzz-field">
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as Severity)}
          className={severityClass[severity]}
        >
          {SEVERITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="service-request-action">
        <button
          type="button"
          className="buzz-btn service-request-btn"
          onClick={() => void createServiceRequest()}
          disabled={creatingRequest || requestCreated}
        >
          <ClipboardList size={15} />
          {requestCreated
            ? 'Service request created'
            : creatingRequest
              ? 'Creating…'
              : 'Create Service Request'}
        </button>
        <span className="service-request-hint">
          {priorityLabel(requestMeta.priority)} · respond within {requestMeta.slaLabel}
        </span>
      </div>

      <div className="buzz-popup-actions">
        {!box.aiGenerated && (
          <button type="button" className="buzz-icon-btn" onClick={remove} aria-label="Delete annotation">
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" className="buzz-btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="buzz-btn primary" onClick={save}>
          Ok
        </button>
      </div>
    </div>
  )
}
