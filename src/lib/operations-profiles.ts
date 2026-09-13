export const OPERATIONS_PROFILE_DEFINITIONS = [
  {
    id: 'revenue-operator',
    displayName: 'Revenue Operator',
    internalWorkers: ['strategist', 'ops-watch'],
  },
  {
    id: 'framesengineering',
    displayName: 'FRAMES Engineering',
    internalWorkers: ['builder', 'reviewer', 'qa'],
  },
  {
    id: 'research-intelligence',
    displayName: 'Research Intelligence',
    internalWorkers: ['researcher'],
  },
  {
    id: 'client-ops',
    displayName: 'Client Ops',
    internalWorkers: ['inbox-triage', 'km-agent'],
  },
] as const

export type OperationsProfileDefinition =
  (typeof OPERATIONS_PROFILE_DEFINITIONS)[number]

export function getOperationsProfileDefinition(
  id: string,
): OperationsProfileDefinition | undefined {
  return OPERATIONS_PROFILE_DEFINITIONS.find((profile) => profile.id === id)
}
