import { useMemo } from 'react'
import { toast } from 'sonner'
import { useReloadChat } from '@/hooks/use-reload-chat'
import { resolveMcpServersForProject } from '@/lib/acp-mcp-persistence'
import { type AcpSession, useAcpStore } from '@/stores/acp-store'
import { registryMcpServersMatch } from '@/stores/acp-store/registry-mcp-fingerprints'
import type { McpServerListProps } from '../McpServerList'
import type { ConnectorsHost } from './connectors-menu-model'

/**
 * The chat composer's connectors (the project's effective MCP servers): one set
 * of props for the desktop `+` menu and the phone `+` sheet. A toggle writes
 * the active project's override (falling back to global when there is no
 * projectId); the running chat keeps the servers it started with until it is
 * reloaded.
 */
export function useChatConnectors(session: AcpSession): {
  connectors: McpServerListProps
  host: ConnectorsHost
} {
  const chatReload = useReloadChat(session.id)
  const rawMcpServers = useAcpStore((s) => s.mcpServers)
  const mcpProjectOverrides = useAcpStore((s) => s.mcpProjectOverrides)
  const setMcpServerEnabled = useAcpStore((s) => s.setMcpServerEnabled)
  const setProjectMcpServerOverride = useAcpStore((s) => s.setProjectMcpServerOverride)
  const probeStatus = useAcpStore((s) => s.mcpProbeStatus)
  const probeError = useAcpStore((s) => s.mcpProbeError)
  const tools = useAcpStore((s) => s.mcpTools)
  const loadMcpTools = useAcpStore((s) => s.loadMcpTools)
  const capabilities = useAcpStore((s) =>
    session.agentId ? s.agents?.[session.agentId]?.capabilities : undefined
  )
  const mcpServers = useMemo(
    () => resolveMcpServersForProject(rawMcpServers, mcpProjectOverrides, session.projectId),
    [rawMcpServers, mcpProjectOverrides, session.projectId]
  )
  const projectOverrides = session.projectId ? mcpProjectOverrides?.[session.projectId] : undefined
  // A chat with no recorded fingerprint (reopened from history) may be
  // stale, so it keeps offering the reload. Not memoized: a reload records
  // the fingerprint outside the store, and the reload state change re-renders.
  const stale =
    registryMcpServersMatch(session.id, rawMcpServers, capabilities, projectOverrides) !== true
  return {
    connectors: {
      // Prefer the session's own count; older sessions fall back to the list.
      count: session.mcpServerCount ?? mcpServers.length,
      servers: mcpServers,
      onToggle: (id: string, enabled: boolean) => {
        const update =
          session.projectId && setProjectMcpServerOverride
            ? setProjectMcpServerOverride(session.projectId, id, enabled)
            : setMcpServerEnabled(id, enabled)
        void update.catch(() => {
          toast.error('Could not update the MCP server. Your previous setting was restored.')
        })
      },
      probeStatus,
      probeError,
      tools,
      onLoadTools: (id: string) => {
        void loadMcpTools(id)
      },
      // Only a stale chat offers the reload, as on the desktop menu.
      onReloadChat: stale ? chatReload.reload : undefined,
      reloadDisabled: chatReload.disabled,
      reloadDisabledReason: chatReload.reason,
      reloading: chatReload.reloading
    },
    host: stale ? 'chat-stale' : 'chat-current'
  }
}
