import { toolDefinition } from '@tanstack/ai'
import {
  createMCPServer,
  promptDefinition,
  resourceDefinition,
} from '@tanstack/ai-mcp/server'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Return a static demo forecast, not live weather data',
  inputSchema: z.object({ city: z.string().trim().min(1).max(200) }),
  outputSchema: z.string(),
}).server(async ({ city }) => `Sunny in ${city} (demo)`)

const cityGuide = resourceDefinition({
  uri: 'file:///city-guide.md',
  name: 'city-guide',
  mimeType: 'text/markdown',
}).read(async () => ({ text: '# Paris\n\nPack a light jacket. (Demo guide)' }))

const tripBrief = promptDefinition({
  name: 'trip_brief',
  description: 'Prepare a prompt for a one-day trip plan',
  argsSchema: z.object({ city: z.string().trim().min(1).max(200) }),
}).render(async ({ city }) => [
  { role: 'user', content: `Write a one-day plan for ${city}.` },
])

export const server = createMCPServer({
  name: 'appfolio-mcp',
  version: '0.1.0',
  tools: [getWeather],
  resources: [cityGuide],
  prompts: [tripBrief],
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
