import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectMcpOverrides, StoredMcpServer } from '@/lib/acp-mcp-persistence'
import { ProjectMcpServersSection } from './mcp-servers-section'

const {
  toastError,
  loadMcpProjectOverrides,
  setProjectMcpServerOverride,
  clearProjectMcpServerOverride,
  resetProjectMcpOverrides,
  storeRef
} = vi.hoisted(() => ({
  toastError: vi.fn(),
  loadMcpProjectOverrides: vi.fn(async () => {}),
  setProjectMcpServerOverride: vi.fn(async () => {}),
  clearProjectMcpServerOverride: vi.fn(async () => {}),
  resetProjectMcpOverrides: vi.fn(async () => {}),
  storeRef: {
    servers: [] as StoredMcpServer[],
    overrides: {} as ProjectMcpOverrides,
    loaded: true
  }
}))

vi.mock('sonner', () => ({
  toast: { error: toastError }
}))

vi.mock('@/stores/acp-store', () => ({
  useAcpStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      mcpServers: storeRef.servers,
      mcpProjectOverrides: storeRef.overrides,
      mcpProjectOverridesLoaded: storeRef.loaded,
      loadMcpProjectOverrides,
      setProjectMcpServerOverride,
      clearProjectMcpServerOverride,
      resetProjectMcpOverrides
    })
}))

const SERVERS: StoredMcpServer[] = [
  { id: 'fs', type: 'stdio', name: 'Files', command: 'npx', args: [], env: [], enabled: true },
  {
    id: 'docs',
    type: 'http',
    name: 'Docs',
    url: 'https://docs.example.com/mcp',
    headers: [],
    enabled: false
  }
]

describe('ProjectMcpServersSection', () => {
  beforeEach(() => {
    storeRef.servers = SERVERS
    storeRef.overrides = {}
    storeRef.loaded = true
    vi.clearAllMocks()
    setProjectMcpServerOverride.mockResolvedValue(undefined)
    clearProjectMcpServerOverride.mockResolvedValue(undefined)
    resetProjectMcpOverrides.mockResolvedValue(undefined)
  })

  it('asks for a project when projectId is missing', () => {
    render(<ProjectMcpServersSection projectId={undefined} onManageGlobal={vi.fn()} />)
    expect(screen.getByText('Open a project to override its MCP servers.')).toBeInTheDocument()
  })

  it('shows empty state and opens global MCP settings', () => {
    storeRef.servers = []
    const onManageGlobal = vi.fn()
    render(<ProjectMcpServersSection projectId="p1" onManageGlobal={onManageGlobal} />)
    expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Manage global servers' }))
    expect(onManageGlobal).toHaveBeenCalledTimes(1)
  })

  it('renders global defaults and project overrides and toggles/resets them', async () => {
    storeRef.overrides = { p1: { docs: true } }
    render(<ProjectMcpServersSection projectId="p1" onManageGlobal={vi.fn()} />)

    expect(
      screen.getByRole('heading', { name: '2 servers · 2 enabled · 1 overridden' })
    ).toBeInTheDocument()
    expect(screen.getByText('Global default · On')).toBeInTheDocument()
    expect(screen.getByText('Project override')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Disable Files for this project' }))
    await waitFor(() => {
      expect(setProjectMcpServerOverride).toHaveBeenCalledWith('p1', 'fs', false)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset Docs to global default' }))
    await waitFor(() => {
      expect(clearProjectMcpServerOverride).toHaveBeenCalledWith('p1', 'docs')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset overrides' }))
    await waitFor(() => {
      expect(resetProjectMcpOverrides).toHaveBeenCalledWith('p1')
    })
  })

  it('shows an error toast when saving an override fails', async () => {
    setProjectMcpServerOverride.mockRejectedValueOnce(new Error('disk full'))
    render(<ProjectMcpServersSection projectId="p1" onManageGlobal={vi.fn()} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Disable Files for this project' }))
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Could not update the MCP server override. Your previous setting was restored.'
      )
    })
  })
})
