import { PersistenceKeys } from '@shared/types/persistence.types'
import { create } from 'zustand'
import { logFrontendError } from '@/lib/log-api'
import { syncSharedKey } from '@/lib/shared-key-sync'
import {
  type DisabledSkillsRecord,
  EMPTY_DISABLED_SKILLS,
  loadDisabledSkills as loadDisabledSkillsFromDisk,
  normalizeDisabledSkills,
  saveDisabledSkills as saveDisabledSkillsToDisk,
  setSkillEnabledInRecord
} from '@/lib/skills-settings-persistence'

export interface SkillsSettingsState {
  disabledSkills: DisabledSkillsRecord
  loaded: boolean
  loadDisabledSkills: () => Promise<void>
  setSkillEnabled: (
    scope: 'global' | 'project',
    skillName: string,
    enabled: boolean,
    projectId?: string
  ) => Promise<void>
}

let skillsSettingsQueue: Promise<unknown> = Promise.resolve()

function runSerializedSkillsMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = skillsSettingsQueue.then(mutation)
  skillsSettingsQueue = run.catch(() => undefined)
  return run
}

let sharedSyncCleanup: (() => void) | null = null

function startSharedDisabledSkillsSync(
  set: (partial: Partial<SkillsSettingsState>) => void
): void {
  if (sharedSyncCleanup) return
  sharedSyncCleanup = syncSharedKey<unknown>(PersistenceKeys.disabledSkills, (change) => {
    const next = change.exists ? normalizeDisabledSkills(change.data) : EMPTY_DISABLED_SKILLS
    set({ disabledSkills: next, loaded: true })
  })
}

export const useSkillsSettingsStore = create<SkillsSettingsState>((set, get) => ({
  disabledSkills: EMPTY_DISABLED_SKILLS,
  loaded: false,

  loadDisabledSkills: async () => {
    try {
      const record = await loadDisabledSkillsFromDisk()
      set({ disabledSkills: record, loaded: true })
      startSharedDisabledSkillsSync((partial) => set(partial))
    } catch (err) {
      void logFrontendError({
        level: 'warn',
        source: 'skills-settings-store.loadDisabledSkills',
        message: `Failed to load disabled skills (${String(err)})`
      })
    }
  },

  setSkillEnabled: (scope, skillName, enabled, projectId) =>
    runSerializedSkillsMutation(async () => {
      const previous = get().disabledSkills
      const next = setSkillEnabledInRecord(previous, scope, skillName, enabled, projectId)
      if (next === previous) return
      set({ disabledSkills: next })
      try {
        await saveDisabledSkillsToDisk(next)
        void logFrontendError({
          level: 'info',
          source: 'skills-settings-store.setSkillEnabled',
          message: `${enabled ? 'Enabled' : 'Disabled'} ${scope} skill '${skillName}'`
        })
      } catch (err) {
        set({ disabledSkills: previous })
        void logFrontendError({
          level: 'warn',
          source: 'skills-settings-store.setSkillEnabled',
          message: `Failed to persist skill toggle for '${skillName}' (${String(err)})`
        })
        throw err
      }
    })
}))

export function _resetSkillsSettingsStoreForTesting(): void {
  sharedSyncCleanup?.()
  sharedSyncCleanup = null
  skillsSettingsQueue = Promise.resolve()
  useSkillsSettingsStore.setState({
    disabledSkills: EMPTY_DISABLED_SKILLS,
    loaded: false
  })
}
