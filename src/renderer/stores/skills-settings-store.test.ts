import { PersistenceKeys } from '@shared/types/persistence.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  watchers: new Map<string, Array<(change: { exists: boolean; data?: unknown }) => void>>(),
  writeImpl: null as
    | null
    | ((
        key: string,
        value: unknown
      ) => Promise<{ success: boolean; data?: undefined; error?: string }>)
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn()
}))

vi.mock('@/lib/api', () => ({
  persistenceApi: {
    read: vi.fn(async (key: string) =>
      host.store.has(key)
        ? { success: true, data: host.store.get(key) }
        : { success: false, code: 'KEY_NOT_FOUND', error: 'not found' }
    ),
    write: vi.fn(async (key: string, value: unknown) => {
      if (host.writeImpl) return host.writeImpl(key, value)
      host.store.set(key, value)
      return { success: true, data: undefined }
    }),
    watchShared: vi.fn(
      (key: string, listener: (change: { exists: boolean; data?: unknown }) => void) => {
        const list = host.watchers.get(key) ?? []
        list.push(listener)
        host.watchers.set(key, list)
        return () => undefined
      }
    )
  }
}))

import {
  _resetSkillsSettingsStoreForTesting,
  useSkillsSettingsStore
} from './skills-settings-store'

describe('skills-settings-store', () => {
  beforeEach(() => {
    host.store.clear()
    host.watchers.clear()
    host.writeImpl = null
    _resetSkillsSettingsStoreForTesting()
  })

  it('loads persisted disabled skills and applies remote shared updates', async () => {
    host.store.set(PersistenceKeys.disabledSkills, {
      global: ['review'],
      projects: { p1: ['lint-fix'] }
    })

    await useSkillsSettingsStore.getState().loadDisabledSkills()
    expect(useSkillsSettingsStore.getState().loaded).toBe(true)
    expect(useSkillsSettingsStore.getState().disabledSkills).toEqual({
      global: ['review'],
      projects: { p1: ['lint-fix'] }
    })

    const watchers = host.watchers.get(PersistenceKeys.disabledSkills) ?? []
    expect(watchers).toHaveLength(1)
    watchers[0]?.({
      exists: true,
      data: { global: ['deploy'], projects: {} }
    })
    expect(useSkillsSettingsStore.getState().disabledSkills).toEqual({
      global: ['deploy'],
      projects: {}
    })
  })

  it('optimistically updates and rolls back on write failure', async () => {
    await useSkillsSettingsStore.getState().loadDisabledSkills()
    let rejectWrite!: (err: Error) => void
    host.writeImpl = () =>
      new Promise((_, reject) => {
        rejectWrite = reject
      })

    const togglePromise = useSkillsSettingsStore
      .getState()
      .setSkillEnabled('global', 'review', false)

    await vi.waitFor(() => {
      expect(useSkillsSettingsStore.getState().disabledSkills.global).toEqual(['review'])
    })
    rejectWrite(new Error('disk full'))
    await expect(togglePromise).rejects.toThrow('disk full')
    expect(useSkillsSettingsStore.getState().disabledSkills.global).toEqual([])
  })

  it('serializes concurrent toggles so earlier writes cannot clobber later ones', async () => {
    await useSkillsSettingsStore.getState().loadDisabledSkills()
    let releaseFirst!: () => void
    let call = 0
    host.writeImpl = async (key, value) => {
      call += 1
      if (call === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
      host.store.set(key, value)
      return { success: true, data: undefined }
    }

    const first = useSkillsSettingsStore.getState().setSkillEnabled('global', 'alpha', false)
    const second = useSkillsSettingsStore.getState().setSkillEnabled('project', 'beta', false, 'p1')

    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    releaseFirst()
    await Promise.all([first, second])

    expect(host.store.get(PersistenceKeys.disabledSkills)).toEqual({
      global: ['alpha'],
      projects: { p1: ['beta'] }
    })
  })
})
