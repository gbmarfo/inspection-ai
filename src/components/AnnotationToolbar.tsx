import { MousePointer2, Pentagon, Square } from 'lucide-react'

export type AnnotationMode = 'select' | 'rectangle' | 'polygon'

type AnnotationToolbarProps = {
  mode: AnnotationMode
  onModeChange: (mode: AnnotationMode) => void
  modes?: AnnotationMode[]
}

const MODE_CONFIG: Record<AnnotationMode, { icon: typeof MousePointer2; label: string }> = {
  select: { icon: MousePointer2, label: 'Select' },
  rectangle: { icon: Square, label: 'Draw Box' },
  polygon: { icon: Pentagon, label: 'Draw Polygon' },
}

export function AnnotationToolbar({
  mode,
  onModeChange,
  modes = ['select', 'rectangle', 'polygon'],
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
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
