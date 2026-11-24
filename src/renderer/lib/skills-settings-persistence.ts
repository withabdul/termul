import { PersistenceKeys } from '@shared/types/persistence.types'
import { persistenceApi } from '@/lib/api'
import type { AgentSkillSummary } from '@/lib/skills-api'

export interface DisabledSkillsRecord {
  global: string[]
  projects: Record<string, string[]>
}

export const EMPTY_DISABLED_SKILLS: DisabledSkillsRecord = {
  global: [],
  projects: {}
}

export function normalizeSkillKey(name: string): string {
  return name.trim().toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSkillList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const key = normalizeSkillKey(item)
    if (key.length > 0) unique.add(key)
  }
  return Array.from(unique).sort()
}

export function normalizeDisabledSkills(raw: unknown): DisabledSkillsRecord {
  if (!isRecord(raw)) return EMPTY_DISABLED_SKILLS
  const global = normalizeSkillList(raw.global)
  const projects: Record<string, string[]> = {}
  if (isRecord(raw.projects)) {
    for (const [projectId, list] of Object.entries(raw.projects)) {
      if (projectId.length === 0) continue
      const normalized = normalizeSkillList(list)
      if (normalized.length > 0) {
        projects[projectId] = normalized
      }
    }
  }
  return { global, projects }
}

export function isSkillDisabled(
  record: DisabledSkillsRecord,
  skill: Pick<AgentSkillSummary, 'name' | 'scope'>,
  projectId?: string | null
): boolean {
  const key = normalizeSkillKey(skill.name)
  if (!key) return false
  if (skill.scope === 'project') {
    return Boolean(projectId && record.projects[projectId]?.includes(key))
  }
  return record.global.includes(key)
}

export function setSkillEnabledInRecord(
  record: DisabledSkillsRecord,
  scope: 'global' | 'project',
  skillName: string,
  enabled: boolean,
  projectId?: string
): DisabledSkillsRecord {
  const key = normalizeSkillKey(skillName)
  if (!key) return record

  if (scope === 'project') {
    if (!projectId) return record
    const existing = record.projects[projectId] ?? []
    const nextList = enabled
      ? existing.filter((entry) => entry !== key)
      : Array.from(new Set([...existing, key])).sort()
    const nextProjects = { ...record.projects }
    if (nextList.length === 0) {
      delete nextProjects[projectId]
    } else {
      nextProjects[projectId] = nextList
    }
    return {
      global: record.global,
      projects: nextProjects
    }
  }

  const nextGlobal = enabled
    ? record.global.filter((entry) => entry !== key)
    : Array.from(new Set([...record.global, key])).sort()
  return {
    global: nextGlobal,
    projects: record.projects
  }
}

export function partitionSkillsByEnabled(
  skills: readonly AgentSkillSummary[],
  record: DisabledSkillsRecord,
  projectId?: string | null
): { enabled: AgentSkillSummary[]; disabledNames: Set<string> } {
  const enabled: AgentSkillSummary[] = []
  const disabledNames = new Set<string>()
  for (const skill of skills) {
    if (isSkillDisabled(record, skill, projectId)) {
      const key = normalizeSkillKey(skill.name)
      if (key) disabledNames.add(key)
    } else {
      enabled.push(skill)
    }
  }
  return { enabled, disabledNames }
}

export async function loadDisabledSkills(): Promise<DisabledSkillsRecord> {
  const res = await persistenceApi.read<unknown>(PersistenceKeys.disabledSkills)
  if (res.success) return normalizeDisabledSkills(res.data)
  if (res.code === 'KEY_NOT_FOUND') return EMPTY_DISABLED_SKILLS
  throw new Error(res.error ?? 'Failed to load disabled skills')
}

export async function saveDisabledSkills(record: DisabledSkillsRecord): Promise<void> {
  const res = await persistenceApi.write(
    PersistenceKeys.disabledSkills,
    normalizeDisabledSkills(record)
  )
  if (!res.success) {
    throw new Error(res.error ?? 'Failed to persist disabled skills')
  }
}
