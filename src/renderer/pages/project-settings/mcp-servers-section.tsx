import { useEffect } from 'react'
import { toast } from 'sonner'
import { Server } from '@/components/icons'
import { SettingsCard, SettingsGroup } from '@/components/settings/SettingsGroup'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { SettingsNotice } from '@/components/settings/SettingsNotice'
import { type StatusTone, StatusWord } from '@/components/settings/StatusWord'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { type StoredMcpServer, transportOf } from '@/lib/acp-mcp-persistence'
import { cn } from '@/lib/utils'
import { useAcpStore } from '@/stores/acp-store'

function serverDetail(server: StoredMcpServer): string {
  return transportOf(server) === 'stdio'
    ? (server as Extract<StoredMcpServer, { type?: 'stdio' }>).command
    : (server as Extract<StoredMcpServer, { type: 'http' | 'sse' }>).url
}

export function ProjectMcpServersSection({
  projectId,
  onManageGlobal
}: {
  projectId: string | undefined
  onManageGlobal: () => void
}): React.JSX.Element {
  const servers = useAcpStore((s) => s.mcpServers)
  const mcpProjectOverrides = useAcpStore((s) => s.mcpProjectOverrides)
  const mcpProjectOverridesLoaded = useAcpStore((s) => s.mcpProjectOverridesLoaded)
  const loadMcpProjectOverrides = useAcpStore((s) => s.loadMcpProjectOverrides)
  const setProjectMcpServerOverride = useAcpStore((s) => s.setProjectMcpServerOverride)
  const clearProjectMcpServerOverride = useAcpStore((s) => s.clearProjectMcpServerOverride)
  const resetProjectMcpOverrides = useAcpStore((s) => s.resetProjectMcpOverrides)

  useEffect(() => {
    if (!mcpProjectOverridesLoaded) {
      void loadMcpProjectOverrides?.()
    }
  }, [mcpProjectOverridesLoaded, loadMcpProjectOverrides])

  if (!projectId) {
    return (
      <SettingsSection id="mcp-servers">
        <SettingsNotice>Open a project to override its MCP servers.</SettingsNotice>
      </SettingsSection>
    )
  }

  const projectOverrides = mcpProjectOverrides?.[projectId] ?? {}
  const overrideCount = servers.filter((server) => server.id in projectOverrides).length
  const enabledCount = servers.filter(
    (server) => (projectOverrides[server.id] ?? server.enabled !== false) === true
  ).length

  const title =
    servers.length === 0
      ? 'Project MCP overrides'
      : overrideCount > 0
        ? `${servers.length} server${servers.length === 1 ? '' : 's'} · ${enabledCount} enabled · ${overrideCount} overridden`
        : `${servers.length} server${servers.length === 1 ? '' : 's'} · ${enabledCount} enabled`

  return (
    <SettingsSection id="mcp-servers">
      <SettingsGroup
        title={title}
        actions={
          servers.length > 0 ? (
            <div className="flex items-center gap-2">
              {overrideCount > 0 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    void resetProjectMcpOverrides(projectId).catch(() => {
                      toast.error(
                        'Could not reset the MCP server overrides. Your previous setting was restored.'
                      )
                    })
                  }}
                >
                  Reset overrides
                </Button>
              ) : null}
              <Button type="button" size="xs" variant="ghost" onClick={onManageGlobal}>
                Manage global
              </Button>
            </div>
          ) : null
        }
        footnote="Overrides apply to new chats in this project. Running chats keep their servers until reloaded."
      >
        {servers.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-6 py-8 text-center">
            <Server size={20} className="mb-1 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No MCP servers configured</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Add global MCP servers first, then override which ones this project uses.
            </p>
            <div className="pt-2">
              <Button type="button" size="sm" onClick={onManageGlobal}>
                Manage global servers
              </Button>
            </div>
          </div>
        ) : (
          <SettingsCard>
            {servers.map((server) => {
              const globalEnabled = server.enabled !== false
              const hasOverride = server.id in projectOverrides
              const effectiveEnabled = hasOverride
                ? Boolean(projectOverrides[server.id])
                : globalEnabled
              const status: { tone: StatusTone; label: string } = effectiveEnabled
                ? { tone: 'success', label: 'On' }
                : { tone: 'muted', label: 'Off' }

              return (
                <div
                  key={server.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'min-w-0 truncate text-sm font-medium',
                          effectiveEnabled ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {server.name}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-px text-3xs font-medium uppercase text-muted-foreground">
                        {transportOf(server)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-mono" title={serverDetail(server)}>
                        {serverDetail(server)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">
                        {hasOverride
                          ? 'Project override'
                          : `Global default · ${globalEnabled ? 'On' : 'Off'}`}
                      </span>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    {hasOverride ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        aria-label={`Reset ${server.name} to global default`}
                        onClick={() => {
                          void clearProjectMcpServerOverride(projectId, server.id).catch(() => {
                            toast.error(
                              'Could not reset the MCP server override. Your previous setting was restored.'
                            )
                          })
                        }}
                      >
                        Reset
                      </Button>
                    ) : null}
                    <StatusWord tone={status.tone}>{status.label}</StatusWord>
                    <Switch
                      checked={effectiveEnabled}
                      aria-label={`${effectiveEnabled ? 'Disable' : 'Enable'} ${server.name} for this project`}
                      onCheckedChange={(next) => {
                        void setProjectMcpServerOverride(projectId, server.id, next).catch(() => {
                          toast.error(
                            'Could not update the MCP server override. Your previous setting was restored.'
                          )
                        })
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </SettingsCard>
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
