import { ChevronDown, ChevronUp, Film } from 'lucide-react'
import type { InspectionImage, LabelStatus } from '../types'

const PAGE_SIZE = 8

type ThumbnailStripProps = {
  images: InspectionImage[]
  activeId: string
  page: number
  collapsed: boolean
  onToggleCollapse: () => void
  onSelect: (id: string) => void
  onPageChange: (page: number) => void
}

const statusBorder: Record<LabelStatus, string> = {
  critical: 'status-critical',
  clear: 'status-clear',
  warning: 'status-warning',
  info: 'status-info',
}

export function ThumbnailStrip({
  images,
  activeId,
  page,
  collapsed,
  onToggleCollapse,
  onSelect,
  onPageChange,
}: ThumbnailStripProps) {
  const totalPages = Math.max(1, Math.ceil(images.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const visible = images.slice(start, start + PAGE_SIZE)
  const activeImage = images.find((image) => image.id === activeId)

  return (
    <footer className={`thumbnail-strip${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="thumbnail-strip-toggle"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span>
          {collapsed ? 'Show filmstrip' : 'Hide filmstrip'}
          {activeImage && collapsed && (
            <span className="thumbnail-strip-current"> · {activeImage.name}</span>
          )}
        </span>
        <span className="thumbnail-strip-count">{images.length} items</span>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {!collapsed && (
        <>
          <div className="thumbnails">
            {visible.map((image) => (
                <button
                key={image.id}
                type="button"
                className={`thumb ${statusBorder[image.status]}${image.id === activeId ? ' selected' : ''}${image.mediaType === 'video' ? ' thumb-video' : ''}`}
                onClick={() => onSelect(image.id)}
              >
                {image.mediaType === 'video' ? (
                  <span className="thumb-video-preview">
                    <Film size={22} />
                  </span>
                ) : (
                  <img src={image.src} alt={image.name} />
                )}
                <span>{image.name}</span>
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === safePage ? 'page active' : 'page'}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </footer>
  )
}
