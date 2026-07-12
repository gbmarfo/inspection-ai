import { ChevronLeft, ChevronRight, Crop, Grid3x3, Maximize2, Search, SlidersHorizontal } from 'lucide-react'
import type { NavTab } from '../types'

const tabs: NavTab[] = [
  'Overview',
  'Assets',
  'Schedule',
  'Images',
  'AI Processing',
  'Service Requests',
  'Reports',
  'Models',
]

type TopBarProps = {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  showLabels: boolean
  onToggleLabels: () => void
  focusTitle?: string
  focusMeta?: string
  onPrevious?: () => void
  onNext?: () => void
}

export function TopBar({
  activeTab,
  onTabChange,
  showLabels,
  onToggleLabels,
  focusTitle,
  focusMeta,
  onPrevious,
  onNext,
}: TopBarProps) {
  const focusMode = activeTab === 'AI Processing'

  if (focusMode) {
    return (
      <header className="topbar topbar-focus">
        <div className="topbar-focus-left">
          <span className="topbar-focus-label">AI Processing</span>
          {focusTitle && <span className="topbar-focus-title">{focusTitle}</span>}
          {focusMeta && <span className="topbar-focus-meta">{focusMeta}</span>}
        </div>

        <div className="topbar-focus-right">
          <div className="topbar-focus-nav">
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous image"
              onClick={onPrevious}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next image"
              onClick={onNext}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
            <span className="toggle-track" />
            Labels
          </label>
        </div>
      </header>
    )
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="search-field">
          <Search size={15} />
          <input type="search" placeholder="Search Image" aria-label="Search Image" />
        </div>
        <button type="button" className="ghost-btn">
          <SlidersHorizontal size={15} />
          Set Filters
        </button>
      </div>

      <nav className="topbar-tabs" aria-label="Sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn${tab === activeTab ? ' active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <button type="button" className="icon-btn" aria-label="Previous">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next">
          <ChevronRight size={18} />
        </button>
        <label className="toggle">
          <input type="checkbox" checked={showLabels} onChange={onToggleLabels} />
          <span className="toggle-track" />
          Show Labels
        </label>
        <button type="button" className="icon-btn" aria-label="Crop">
          <Crop size={17} />
        </button>
        <button type="button" className="icon-btn" aria-label="Grid view">
          <Grid3x3 size={17} />
        </button>
        <button type="button" className="icon-btn" aria-label="Fullscreen">
          <Maximize2 size={17} />
        </button>
      </div>
    </header>
  )
}
