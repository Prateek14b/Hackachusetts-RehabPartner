import type { PlanStatus } from '../api'

const STYLES: Record<PlanStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  active: 'bg-blue-100 text-blue-900',
  completed: 'bg-green-100 text-green-800',
}

export default function StatusBadge({ status }: { status: PlanStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold tracking-wide uppercase ${STYLES[status]}`}>
      {status}
    </span>
  )
}
