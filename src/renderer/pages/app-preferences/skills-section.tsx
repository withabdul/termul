import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { SettingsCard, SettingsGroup } from '@/components/settings/SettingsGroup'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { StatusWord } from '@/components/settings/StatusWord'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAgentSkills } from '@/hooks/use-agent-skills'
import { logFrontendError } from '@/lib/log-api'
import type { AgentSkillSummary } from '@/lib/skills-api'
import { type DisabledSkillsRecord, isSkillDisabled } from '@/lib/skills-settings-persistence'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'
import { useActiveProject } from '@/stores/project-store'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import { useSkillsSettingsStore } from '@/stores/skills-settings-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

function skillsIn(skills: AgentSkillSummary[], scope: 'global' | 'project'): AgentSkillSummary[] {
  return skills.filter((skill) => skill.scope === scope)
}

function SkillRows({
  skills,
  projectId,
  disabledSkills,
  onToggle
}: {
  skills: AgentSkillSummary[]
  projectId: string | undefined
  disabledSkills: DisabledSkillsRecord
  onToggle: (skill: AgentSkillSummary, enabled: boolean) => void
}): React.JSX.Element {
  const openSkill = useCallback(async (skill: AgentSkillSummary) => {
    try {
      await useEditorStore.getState().openFile(skill.path)
      if (!useEditorStore.getState().openFiles.has(skill.path)) {
        throw new Error('editor tab limit reached')
      }
      useWorkspaceStore.getState().addEditorTab(skill.path)
      useSettingsModalStore.getState().close()
    } catch (err) {
      void logFrontendError({
        level: 'warn',
        source: 'SkillsSection',
        message: `Failed to open skill '${skill.name}': ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }, [])

  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        No skills in this folder.
      </div>
    )
  }

  return (
    <SettingsCard>
      {skills.map((skill) => {
        const enabled = !isSkillDisabled(disabledSkills, skill, projectId)
        return (
          <SettingsRow
            key={`${skill.scope}:${skill.name}`}
            label={<span className={cn(!enabled && 'text-muted-foreground')}>{skill.name}</span>}
            description={skill.description || undefined}
            layout="inline"
          >
            <div className="flex shrink-0 items-center gap-3">
              {!enabled && <StatusWord tone="muted">Off</StatusWord>}
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => void openSkill(skill)}
                aria-label={`Open ${skill.name}`}
              >
                Open
              </Button>
              <Switch
                checked={enabled}
                aria-label={`${enabled ? 'Disable' : 'Enable'} ${skill.name}`}
                onCheckedChange={(next) => onToggle(skill, next)}
              />
            </div>
          </SettingsRow>
        )
      })}
    </SettingsCard>
  )
}

export function SkillsSection(): React.JSX.Element {
  const project = useActiveProject()
  const { skills: listed, loading } = useAgentSkills(project?.path)
  const disabledSkills = useSkillsSettingsStore((s) => s.disabledSkills)
  const loaded = useSkillsSettingsStore((s) => s.loaded)
  const loadDisabledSkills = useSkillsSettingsStore((s) => s.loadDisabledSkills)
  const setSkillEnabled = useSkillsSettingsStore((s) => s.setSkillEnabled)

  useEffect(() => {
    if (!loaded) {
      void loadDisabledSkills()
    }
  }, [loaded, loadDisabledSkills])

  const handleToggle = useCallback(
    (skill: AgentSkillSummary, enabled: boolean) => {
      const scope = skill.scope === 'project' ? 'project' : 'global'
      void setSkillEnabled(scope, skill.name, enabled, project?.id).catch(() => {
        toast.error('Could not update the skill. Your previous setting was restored.')
      })
    },
    [project?.id, setSkillEnabled]
  )

  const skills = Array.isArray(listed) ? listed : []
  const globalSkills = skillsIn(skills, 'global')
  const projectSkills = skillsIn(skills, 'project')

  const globalEnabledCount = globalSkills.filter(
    (skill) => !isSkillDisabled(disabledSkills, skill, project?.id)
  ).length
  const projectEnabledCount = projectSkills.filter(
    (skill) => !isSkillDisabled(disabledSkills, skill, project?.id)
  ).length

  const count = (n: number) => (n === 1 ? '1 skill' : `${n} skills`)
  const groupCount = (list: AgentSkillSummary[], enabledCount: number) =>
    enabledCount < list.length ? `${enabledCount} of ${list.length} enabled` : count(list.length)

  return (
    <SettingsSection id="skills">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading skills…</p>
      ) : (
        <>
          <SettingsGroup
            title={`Global · ${groupCount(globalSkills, globalEnabledCount)}`}
            footnote="Disabled skills are hidden from Troupe's slash menu. Skill files on disk are not modified."
          >
            <SkillRows
              skills={globalSkills}
              projectId={project?.id}
              disabledSkills={disabledSkills}
              onToggle={handleToggle}
            />
          </SettingsGroup>
          <SettingsGroup
            title={
              project
                ? `Project · ${project.name} · ${groupCount(projectSkills, projectEnabledCount)}`
                : 'Project'
            }
          >
            {project ? (
              <SkillRows
                skills={projectSkills}
                projectId={project.id}
                disabledSkills={disabledSkills}
                onToggle={handleToggle}
              />
            ) : (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                Open a project to see its skills.
              </div>
            )}
          </SettingsGroup>
        </>
      )}
    </SettingsSection>
  )
}
