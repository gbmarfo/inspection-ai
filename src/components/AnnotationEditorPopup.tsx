import { useEffect, useState } from 'react'
import { ClipboardList, Trash2 } from 'lucide-react'
import { useAnnotator, type AnnotoriousImageAnnotator } from '@annotorious/react'
import type { PopupProps } from '@annotorious/react'
import { CLASSIFICATIONS, SEVERITIES, type Severity } from '../types'
import { getAnnotationMeta, getBodyValue, SEVERITY_COLORS } from '../utils/annotations'
import { priorityFromSeverity, priorityLabel } from '../utils/serviceRequests'

const severityClass: Record<Severity, string> = {
  Low: 'severity-low',
  Medium: 'severity-medium',
  High: 'severity-high',
  Critical: 'severity-critical',
}

type AnnotationEditorPopupProps = PopupProps & {
  fallbackClassification?: string
  fallbackSeverity?: Severity
  onSaveAnnotation?: (
    annotationId: string,
    patch: { classification?: string; severity?: Severity; label?: string },
  ) => void | Promise<void>
  onDeleteUserAnnotation?: (annotationId: string) => void | Promise<void>
  onCreateServiceRequest?: (annotationId: string) => void | Promise<void>
}

export function AnnotationEditorPopup({
  annotation,
  fallbackClassification,
  fallbackSeverity,
  onCreateBody,
  onUpdateBody,
  onSaveAnnotation,
  onDeleteUserAnnotation,
  onCreateServiceRequest,
}: AnnotationEditorPopupProps) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()

  // The box label chip reads from the live annotator store, so read the popup's
  // values from the same source. The `annotation` prop can arrive without bodies
  // (e.g. the auto-selected default box). When the tagging/describing body is
  // missing we fall back to the box's stored values (same fallback the label
  // chip uses) so the popup can never disagree with the on-box label.
  const source = anno?.getAnnotationById?.(annotation.id) ?? annotation
  const meta = getAnnotationMeta(source)

  const classificationFallback = fallbackClassification ?? CLASSIFICATIONS[0]
  const severityFallback: Severity = fallbackSeverity ?? 'Medium'

  const [classification, setClassification] = useState(
    () => getBodyValue(source, 'tagging') ?? classificationFallback,
  )
  const [severity, setSeverity] = useState<Severity>(
    () => (getBodyValue(source, 'describing') as Severity) ?? severityFallback,
  )
  const [creatingRequest, setCreatingRequest] = useState(false)
  const [requestCreated, setRequestCreated] = useState(false)

  const requestMeta = priorityFromSeverity(severity)

  useEffect(() => {
    const current = anno?.getAnnotationById?.(annotation.id) ?? annotation
    setClassification(getBodyValue(current, 'tagging') ?? classificationFallback)
    setSeverity((getBodyValue(current, 'describing') as Severity) ?? severityFallback)
    setRequestCreated(false)
  }, [annotation, anno, classificationFallback, severityFallback])

  const classBody = source.bodies?.find((body) => body.purpose === 'tagging')
  const severityBody = source.bodies?.find((body) => body.purpose === 'describing')

  const classificationOptions = CLASSIFICATIONS.includes(
    classification as (typeof CLASSIFICATIONS)[number],
  )
    ? [...CLASSIFICATIONS]
    : [classification, ...CLASSIFICATIONS]

  const save = () => {
    const originalClassification = getBodyValue(source, 'tagging') ?? classificationFallback
    const originalSeverity = (getBodyValue(source, 'describing') as Severity) ?? severityFallback
    const classificationChanged = classification !== originalClassification
    const severityChanged = severity !== originalSeverity

    // No edits — close without touching the annotation so unchanged boxes stay intact.
    if (!classificationChanged && !severityChanged) {
      anno.cancelSelected()
      return
    }

    const patch: { classification?: string; severity?: Severity; label?: string } = {}

    if (classificationChanged) {
      if (classBody) {
        // Annotorious replaces the body wholesale, so keep purpose/id intact.
        onUpdateBody(classBody, { ...classBody, value: classification })
      } else {
        onCreateBody({ purpose: 'tagging', value: classification })
      }
      patch.classification = classification
      patch.label = classification
    }

    if (severityChanged) {
      if (severityBody) {
        // Annotorious replaces the body wholesale, so keep purpose/id intact.
        onUpdateBody(severityBody, { ...severityBody, value: severity })
      } else {
        onCreateBody({ purpose: 'describing', value: severity })
      }
      patch.severity = severity
    }

    void onSaveAnnotation?.(annotation.id, patch)

    anno.cancelSelected()
  }

  const cancel = () => {
    anno.cancelSelected()
  }

  const remove = () => {
    if (!meta.aiGenerated) {
      void onDeleteUserAnnotation?.(annotation.id)
    }
    anno.removeAnnotation(annotation.id)
  }

  const createServiceRequest = async () => {
    if (!onCreateServiceRequest || creatingRequest) return
    setCreatingRequest(true)
    try {
      await onCreateServiceRequest(annotation.id)
      setRequestCreated(true)
    } finally {
      setCreatingRequest(false)
    }
  }

  return (
    <div className="buzz-popup">
      {meta.aiGenerated ? (
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
        <button type="button" className="buzz-icon-btn" onClick={remove} aria-label="Delete annotation">
          <Trash2 size={16} />
        </button>
        <button type="button" className="buzz-btn ghost" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="buzz-btn primary" onClick={save}>
          Ok
        </button>
      </div>
    </div>
  )
}
