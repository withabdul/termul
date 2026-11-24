import { PersistenceKeys } from '@shared/types/persistence.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  watchers: new Map<string, Array<(change: { exists: boolean; data?: unknown }) => void>>(),
  newSession: vi.fn(async () => ({ sessionId: 's-new' })),
  loadSession: vi.fn(async () => ({})),
  resumeSession: vi.fn(async () => ({})),
  closeSession: vi.fn(async () => undefined),
  killAgent: vi.fn(async () => undefined)
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() }
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn()
}))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: vi.fn(() => false),
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn()
}))
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  persistenceApi: {
    read: vi.fn(async (key: string) =>
      host.store.has(key)
        ? { success: true, data: host.store.get(key) }
        : { success: false, error: 'not found', code: 'KEY_NOT_FOUND' }
    ),
    write: vi.fn(async (key: string, value: unknown) => {
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
vi.mock('@/lib/acp-api', async (orig) => {
  const actual = await orig<typeof import('@/lib/acp-api')>()
  return {
    ...actual,
    acpApi: {
      ...actual.acpApi,
      newSession: host.newSession,
      loadSession: host.loadSession,
      resumeSession: host.resumeSession,
      closeSession: host.closeSession,
      killAgent: host.killAgent
    }
  }
})

import { useAcpStore } from '@/stores/acp-store'
import {
  _resetRegistryMcpFingerprintsForTesting,
  registryMcpServersAreCurrent,
  registryMcpServersMatch
} from './registry-mcp-fingerprints'
import { FRESH } from './testkit'

const FILES = {
  id: 'files',
  type: 'stdio' as const,
  name: 'Files',
  command: 'npx',
  args: ['-y', 'files'],
  env: [],
  enabled: true
}

const DOCS = {
  id: 'docs',
  type: 'stdio' as const,
  name: 'Docs',
  command: 'npx',
  args: ['-y', 'docs'],
  env: [],
  enabled: false
}

describe('per-project MCP server overrides', () => {
  beforeEach(() => {
    host.store.clear()
    host.watchers.clear()
    vi.clearAllMocks()
    _resetRegistryMcpFingerprintsForTesting()
    useAcpStore.setState({
      ...FRESH,
      mcpServers: [FILES, DOCS],
      mcpServersLoaded: true,
      mcpProjectOverrides: {},
      mcpProjectOverridesLoaded: true,
      agents: {
        'agent-1': {
          id: 'agent-1',
          name: 'Claude',
          version: '1.0.0',
          capabilities: { mcpCapabilities: { http: true, sse: true } }
        }
      },
      agentStatus: { 'agent-1': 'connected' }
    })
  })

  it('stores overrides per project and clears redundant entries matching the global default', async () => {
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'files', false)
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'docs', true)

    expect(useAcpStore.getState().mcpProjectOverrides).toEqual({
      'proj-a': { files: false, docs: true }
    })
    expect(host.store.get(PersistenceKeys.acpMcpProjectOverrides)).toEqual({
      'proj-a': { files: false, docs: true }
    })

    // Toggling back to global default removes the override instead of keeping noise.
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'files', true)
    expect(useAcpStore.getState().mcpProjectOverrides).toEqual({
      'proj-a': { docs: true }
    })

    await useAcpStore.getState().resetProjectMcpOverrides('proj-a')
    expect(useAcpStore.getState().mcpProjectOverrides).toEqual({})
  })

  it('passes project-effective MCP servers to createSession without affecting other projects', async () => {
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'files', false)
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'docs', true)

    const sessionA = await useAcpStore
      .getState()
      .createSession('agent-1', '/work-a', undefined, 'proj-a')
    expect(host.newSession).toHaveBeenLastCalledWith(
      'agent-1',
      '/work-a',
      [{ type: 'stdio', name: 'Docs', command: 'npx', args: ['-y', 'docs'], env: [] }],
      expect.objectContaining({ projectId: 'proj-a' })
    )

    const sessionB = await useAcpStore
      .getState()
      .createSession('agent-1', '/work-b', undefined, 'proj-b')
    expect(host.newSession).toHaveBeenLastCalledWith(
      'agent-1',
      '/work-b',
      [{ type: 'stdio', name: 'Files', command: 'npx', args: ['-y', 'files'], env: [] }],
      expect.objectContaining({ projectId: 'proj-b' })
    )

    // Session B stays current when Project A changes, and Session A becomes stale when Project A changes.
    expect(registryMcpServersAreCurrent(useAcpStore.getState(), sessionB, 'agent-1', 'proj-b')).toBe(
      true
    )
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'files', true)
    expect(
      registryMcpServersMatch(
        sessionA,
        useAcpStore.getState().mcpServers,
        useAcpStore.getState().agents['agent-1']?.capabilities,
        useAcpStore.getState().mcpProjectOverrides['proj-a']
      )
    ).toBe(false)
    expect(registryMcpServersAreCurrent(useAcpStore.getState(), sessionB, 'agent-1', 'proj-b')).toBe(
      true
    )
  })

  it('prunes overrides for deleted MCP servers and syncs remote override updates', async () => {
    await useAcpStore.getState().loadMcpProjectOverrides()
    await useAcpStore.getState().setProjectMcpServerOverride('proj-a', 'files', false)
    await useAcpStore.getState().deleteMcpServer('files')

    await vi.waitFor(() => {
      expect(useAcpStore.getState().mcpProjectOverrides).toEqual({})
    })

    const watchers = host.watchers.get(PersistenceKeys.acpMcpProjectOverrides) ?? []
    expect(watchers).toHaveLength(1)
    watchers[0]?.({
      exists: true,
      data: { 'proj-b': { docs: true } }
    })
    expect(useAcpStore.getState().mcpProjectOverrides).toEqual({ 'proj-b': { docs: true } })
  })
})
