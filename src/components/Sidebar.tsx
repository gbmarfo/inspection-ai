import { useState } from 'react'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ClipboardList,
  FileText,
  Images,
  LayoutDashboard,
  LogOut,
  ScanEye,
  Settings,
  MapPinned,
} from 'lucide-react'
import type { NavTab } from '../types'

type SidebarItem = {
  icon: typeof LayoutDashboard
  label: string
  tab?: NavTab
}

type SidebarSection = {
  title?: string
  items: SidebarItem[]
}

const sections: SidebarSection[] = [
  {
    items: [{ icon: LayoutDashboard, label: 'Overview', tab: 'Overview' }],
  },
  {
    title: 'Inspection',
    items: [
      { icon: MapPinned, label: 'Assets', tab: 'Assets' },
      { icon: Images, label: 'Images', tab: 'Images' },
      { icon: ScanEye, label: 'AI Processing', tab: 'AI Processing' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: CalendarDays, label: 'Schedule', tab: 'Schedule' },
      { icon: ClipboardList, label: 'Service Requests', tab: 'Service Requests' },
      { icon: FileText, label: 'Reports', tab: 'Reports' },
    ],
  },
  {
    title: 'Admin',
    items: [{ icon: BarChart3, label: 'Models', tab: 'Models' }],
  },
  {
    title: 'Account',
    items: [
      { icon: Settings, label: 'Settings' },
      { icon: LogOut, label: 'Logout' },
    ],
  },
]

type SidebarProps = {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <aside className={`sidebar${expanded ? ' expanded' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">P</div>
        {expanded && <span className="sidebar-brand">PowerAI</span>}
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.title ?? 'root'} className="sidebar-section">
            {expanded && section.title && (
              <span className="sidebar-section-title">{section.title}</span>
            )}
            {section.items.map(({ icon: Icon, label, tab }) => (
              <button
                key={label}
                type="button"
                className={`sidebar-btn${tab && tab === activeTab ? ' active' : ''}`}
                title={label}
                aria-label={label}
                disabled={!tab}
                onClick={() => tab && onTabChange(tab)}
              >
                <Icon size={18} strokeWidth={1.75} />
                {expanded && <span className="sidebar-label">{label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        {expanded && <span className="sidebar-label">Collapse</span>}
      </button>
    </aside>
  )
}
