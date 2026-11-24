import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSkillSummary } from '@/lib/skills-api'
import type { DisabledSkillsRecord } from '@/lib/skills-settings-persistence'
import { SkillsSection } from './skills-section'

const openFile = vi.fn()
const addEditorTab = vi.fn()
const closeSettings = vi.fn()
const toastError = vi.fn()
const loadDisabledSkills = vi.fn(async () => {})
const setSkillEnabled = vi.fn(async () => {})
const skillsRef = { current: [] as AgentSkillSummary[] }
const disabledRef = { current: { global: [], projects: {} } as DisabledSkillsRecord }
const projectRef = {
  current: { id: 'p1', name: 'Cloud Hello', path: '/tmp/termul-hello' } as
    | { id: string; name: string; path: string }
    | undefined
}

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) }
}))

vi.mock('@/hooks/use-agent-skills', () => ({
  useAgentSkills: () => ({ skills: skillsRef.current, loading: false, reload: () => {} })
}))

vi.mock('@/stores/skills-settings-store', () => ({
  useSkillsSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      disabledSkills: disabledRef.current,
      loaded: true,
      loadDisabledSkills,
      setSkillEnabled
    })
}))

vi.mock('@/stores/project-store', () => ({
  useActiveProject: () => projectRef.current
}))

vi.mock('@/stores/editor-store', () => ({
  useEditorStore: {
    getState: () => ({
      openFile,
      openFiles: new Map([['/home/u/.agents/skills/review/SKILL.md', {}]])
    })
  }
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: { getState: () => ({ addEditorTab }) }
}))

vi.mock('@/stores/settings-modal-store', () => ({
  useSettingsModalStore: { getState: () => ({ close: closeSettings }) }
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn()
}))

const globalSkill: AgentSkillSummary = {
  name: 'review',
  description: 'Review code',
  scope: 'global',
  path: '/home/u/.agents/skills/review/SKILL.md'
}

const projectSkill: AgentSkillSummary = {
  name: 'writing-guidelines',
  description: 'Review docs',
  scope: 'project',
  path: '/tmp/termul-hello/.agents/skills/writing-guidelines/SKILL.md'
}

describe('SkillsSection', () => {
  beforeEach(() => {
    skillsRef.current = [globalSkill, projectSkill]
    disabledRef.current = { global: [], projects: {} }
    projectRef.current = { id: 'p1', name: 'Cloud Hello', path: '/tmp/termul-hello' }
    openFile.mockReset().mockResolvedValue(undefined)
    addEditorTab.mockReset()
    closeSettings.mockReset()
    toastError.mockReset()
    loadDisabledSkills.mockReset().mockResolvedValue(undefined)
    setSkillEnabled.mockReset().mockResolvedValue(undefined)
  })

  it('lists global and project skills for the open project', () => {
    render(<SkillsSection />)
    expect(screen.getByRole('heading', { name: 'Global · 1 skill' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Project · Cloud Hello · 1 skill' })
    ).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    expect(screen.getByText('writing-guidelines')).toBeInTheDocument()
  })

  it('toggles global and project skills and surfaces disabled state', async () => {
    disabledRef.current = { global: ['review'], projects: {} }
    render(<SkillsSection />)

    expect(screen.getByRole('heading', { name: 'Global · 0 of 1 enabled' })).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable review' }))
    await waitFor(() => {
      expect(setSkillEnabled).toHaveBeenCalledWith('global', 'review', true, 'p1')
    })

    fireEvent.click(screen.getByRole('switch', { name: 'Disable writing-guidelines' }))
    await waitFor(() => {
      expect(setSkillEnabled).toHaveBeenCalledWith('project', 'writing-guidelines', false, 'p1')
    })
  })

  it('shows an error toast when persisting a skill toggle fails', async () => {
    setSkillEnabled.mockRejectedValueOnce(new Error('disk full'))
    render(<SkillsSection />)

    fireEvent.click(screen.getByRole('switch', { name: 'Disable review' }))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Could not update the skill. Your previous setting was restored.'
      )
    })
  })

  it('opens the skill file and closes settings', async () => {
    render(<SkillsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Open review' }))
    await vi.waitFor(() => {
      expect(openFile).toHaveBeenCalledWith(globalSkill.path)
    })
    expect(addEditorTab).toHaveBeenCalledWith(globalSkill.path)
    expect(closeSettings).toHaveBeenCalled()
  })

  it('asks for a project when none is open', () => {
    projectRef.current = undefined
    skillsRef.current = [globalSkill]
    render(<SkillsSection />)
    expect(screen.getByText('Open a project to see its skills.')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
  })
})
