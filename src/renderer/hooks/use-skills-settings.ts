import { useEffect } from 'react'
import { logFrontendError } from '@/lib/log-api'
import { useSkillsSettingsStore } from '@/stores/skills-settings-store'

/**
 * Load persisted disabled-skill overrides once at app mount (both desktop
 * `TauriApp` and web `App` roots) so the slash menu and Skills settings stay
 * synchronized across devices and sessions.
 */
export function useSkillsSettings(): void {
  const loadDisabledSkills = useSkillsSettingsStore((s) => s.loadDisabledSkills)

  useEffect(() => {
    loadDisabledSkills().catch((err: unknown) => {
      void logFrontendError({
        level: 'warn',
        source: 'useSkillsSettings',
        message: `Disabled skills load rejected (${String(err)})`
      })
    })
  }, [loadDisabledSkills])
}
