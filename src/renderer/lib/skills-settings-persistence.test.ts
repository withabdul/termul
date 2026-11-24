import { PersistenceKeys } from '@shared/types/persistence.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistenceApi } from '@/lib/api'
import type { AgentSkillSummary } from '@/lib/skills-api'
import {
  EMPTY_DISABLED_SKILLS,
  isSkillDisabled,
  loadDisabledSkills,
  normalizeDisabledSkills,
  normalizeSkillKey,
  partitionSkillsByEnabled,
  saveDisabledSkills,
  setSkillEnabledInRecord
} from './skills-settings-persistence'

vi.mock('@/lib/api', () => ({
  persistenceApi: {
    read: vi.fn(),
    write: vi.fn()
  }
}))

const globalReview: AgentSkillSummary = {
  name: 'Review',
  description: 'Review code',
  scope: 'global',
  path: '/home/u/.agents/skills/review/SKILL.md'
}

const projectLint: AgentSkillSummary = {
  name: 'lint-fix',
  description: 'Fix lint',
  scope: 'project',
  path: '/repo/.agents/skills/lint-fix/SKILL.md'
}

describe('skills-settings-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes skill keys by trimming and lowercasing', () => {
    expect(normalizeSkillKey('  My-Skill ')).toBe('my-skill')
  })

  it('normalizes malformed inputs safely', () => {
    expect(normalizeDisabledSkills(null)).toEqual(EMPTY_DISABLED_SKILLS)
    expect(normalizeDisabledSkills(['bad'])).toEqual(EMPTY_DISABLED_SKILLS)
    expect(
      normalizeDisabledSkills({
        global: [' Review ', '', 123, 'review'],
        projects: {
          p1: [' Lint-Fix ', 'lint-fix'],
          p2: [],
          '': ['ignored']
        }
      })
    ).toEqual({
      global: ['review'],
      projects: { p1: ['lint-fix'] }
    })
  })

  it('checks disabled state by scope and project', () => {
    const record = {
      global: ['review'],
      projects: { p1: ['lint-fix'] }
    }
    expect(isSkillDisabled(record, globalReview, 'p1')).toBe(true)
    expect(isSkillDisabled(record, globalReview, undefined)).toBe(true)
    expect(isSkillDisabled(record, projectLint, 'p1')).toBe(true)
    expect(isSkillDisabled(record, projectLint, 'p2')).toBe(false)
    expect(isSkillDisabled(record, projectLint, undefined)).toBe(false)
  })

  it('toggles global and project skills immutably and prunes empty project arrays', () => {
    const step1 = setSkillEnabledInRecord(EMPTY_DISABLED_SKILLS, 'global', 'Review', false)
    expect(step1).toEqual({ global: ['review'], projects: {} })

    const step2 = setSkillEnabledInRecord(step1, 'project', 'lint-fix', false, 'p1')
    expect(step2).toEqual({ global: ['review'], projects: { p1: ['lint-fix'] } })

    const step3 = setSkillEnabledInRecord(step2, 'project', 'lint-fix', true, 'p1')
    expect(step3).toEqual({ global: ['review'], projects: {} })

    // Missing projectId for project scope is a no-op.
    expect(setSkillEnabledInRecord(step3, 'project', 'lint-fix', false)).toBe(step3)
  })

  it('partitions enabled skills and disabled names for a project', () => {
    const record = { global: ['review'], projects: { p1: ['lint-fix'] } }
    const forP1 = partitionSkillsByEnabled([globalReview, projectLint], record, 'p1')
    expect(forP1.enabled).toEqual([])
    expect(forP1.disabledNames).toEqual(new Set(['review', 'lint-fix']))

    const forP2 = partitionSkillsByEnabled([globalReview, projectLint], record, 'p2')
    expect(forP2.enabled).toEqual([projectLint])
    expect(forP2.disabledNames).toEqual(new Set(['review']))
  })

  it('loads empty defaults on KEY_NOT_FOUND and throws on read errors', async () => {
    vi.mocked(persistenceApi.read).mockResolvedValueOnce({
      success: false,
      code: 'KEY_NOT_FOUND',
      error: 'missing'
    })
    expect(await loadDisabledSkills()).toEqual(EMPTY_DISABLED_SKILLS)
    expect(persistenceApi.read).toHaveBeenCalledWith(PersistenceKeys.disabledSkills)

    vi.mocked(persistenceApi.read).mockResolvedValueOnce({
      success: false,
      code: 'IO_ERROR',
      error: 'disk offline'
    })
    await expect(loadDisabledSkills()).rejects.toThrow('disk offline')
  })

  it('persists normalized disabled skills and throws on write errors', async () => {
    vi.mocked(persistenceApi.write).mockResolvedValueOnce({ success: true, data: undefined })
    await saveDisabledSkills({ global: [' Review '], projects: { p1: [] } })
    expect(persistenceApi.write).toHaveBeenCalledWith(PersistenceKeys.disabledSkills, {
      global: ['review'],
      projects: {}
    })

    vi.mocked(persistenceApi.write).mockResolvedValueOnce({
      success: false,
      code: 'WRITE_ERROR',
      error: 'read-only'
    })
    await expect(saveDisabledSkills(EMPTY_DISABLED_SKILLS)).rejects.toThrow('read-only')
  })
})
