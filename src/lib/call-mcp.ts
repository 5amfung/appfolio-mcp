import { createServerFn } from '@tanstack/react-start'
import { createMCPClient } from '@tanstack/ai-mcp'
import { server } from '@/mcp-server'

export const callMcpDemo = createServerFn({ method: 'POST' }).handler(
  async () => {
    const client = await createMCPClient({ server })
    const forecast = await client.callTool('get_weather', { city: 'Paris' })
    const guide = await client.readResource('file:///city-guide.md')
    const prompt = await client.getPrompt('trip_brief', { city: 'Paris' })
    return { forecast, guide: guide.text, brief: prompt[0]?.content ?? '' }
  },
)
