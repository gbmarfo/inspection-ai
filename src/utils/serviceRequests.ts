import type { ServiceRequest, ServiceRequestPriority, Severity } from '../types'

export const PRIORITY_BY_SEVERITY: Record<
  Severity,
  { priority: ServiceRequestPriority; slaDays: number; slaLabel: string }
> = {
  Low: { priority: 'routine', slaDays: 90, slaLabel: '90 days' },
  Medium: { priority: 'routine', slaDays: 30, slaLabel: '30 days' },
  High: { priority: 'urgent', slaDays: 7, slaLabel: '7 days' },
  Critical: { priority: 'emergency', slaDays: 1, slaLabel: '24 hours' },
}

export function priorityFromSeverity(severity: Severity) {
  return PRIORITY_BY_SEVERITY[severity] ?? PRIORITY_BY_SEVERITY.Medium
}

export function priorityLabel(priority: ServiceRequestPriority): string {
  switch (priority) {
    case 'emergency':
      return 'Emergency'
    case 'urgent':
      return 'Urgent'
    default:
      return 'Routine'
  }
}

export function statusLabel(status: ServiceRequest['status']): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled'
    case 'in_progress':
      return 'In progress'
    case 'closed':
      return 'Closed'
    default:
      return 'Open'
  }
}
