import { Check, Eraser, MousePointer2, Pentagon, Sparkles, Square, Undo2 } from 'lucide-react'

export type AnnotationMode = 'select' | 'rectangle' | 'polygon' | 'segment'

type AnnotationToolbarProps = {
  mode: AnnotationMode
  onModeChange: (mode: AnnotationMode) => void
  modes?: AnnotationMode[]
  segmentBusy?: boolean
  segmentClickCount?: number
  canAcceptSegment?: boolean
  onAcceptSegment?: () => void
  onUndoSegmentClick?: () => void
  onClearSegment?: () => void
}

const MODE_CONFIG: Record<AnnotationMode, { icon: typeof MousePointer2; label: string }> = {
  select: { icon: MousePointer2, label: 'Select' },
  rectangle: { icon: Square, label: 'Draw Box' },
  polygon: { icon: Pentagon, label: 'Draw Polygon' },
  segment: { icon: Sparkles, label: 'AI Segment' },
}

export function AnnotationToolbar({
  mode,
  onModeChange,
  modes = ['select', 'rectangle', 'polygon', 'segment'],
  segmentBusy = false,
  segmentClickCount = 0,
  canAcceptSegment = false,
  onAcceptSegment,
  onUndoSegmentClick,
  onClearSegment,
}: AnnotationToolbarProps) {
  return (
    <div className="annotation-toolbar">
      {modes.map((option) => {
        const { icon: Icon, label } = MODE_CONFIG[option]
        return (
          <button
            key={option}
            type="button"
            className={`annotation-tool${mode === option ? ' active' : ''}`}
            onClick={() => onModeChange(option)}
            aria-pressed={mode === option}
            title={
              option === 'segment'
                ? 'RITM: left click = include, right click / Shift+click = exclude'
                : label
            }
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}

      {mode === 'segment' && (
        <div className="segment-toolbar-actions">
          <span className="segment-toolbar-hint">
            {segmentBusy
              ? 'Segmenting…'
              : segmentClickCount === 0
                ? 'Left = include · Right = exclude'
                : `${segmentClickCount} click${segmentClickCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            className="annotation-tool"
            disabled={segmentClickCount === 0 || segmentBusy}
            onClick={onUndoSegmentClick}
            title="Undo last click"
          >
            <Undo2 size={15} />
            Undo
          </button>
          <button
            type="button"
            className="annotation-tool"
            disabled={segmentClickCount === 0 || segmentBusy}
            onClick={onClearSegment}
            title="Clear clicks and preview"
          >
            <Eraser size={15} />
            Clear
          </button>
          <button
            type="button"
            className="annotation-tool segment-accept"
            disabled={!canAcceptSegment || segmentBusy}
            onClick={onAcceptSegment}
            title="Save segment as annotation"
          >
            <Check size={15} />
            Accept
          </button>
        </div>
      )}
    </div>
  )
}
