import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { callMcpDemo } from '@/lib/call-mcp'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/mcp-demo')({ component: McpDemo })

function McpDemo() {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof callMcpDemo>
  > | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function runDemo() {
    setPending(true)
    setError('')
    setResult(null)
    try {
      setResult(await callMcpDemo())
    } catch {
      setError('Unable to call the MCP demo. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">MCP server demo</h1>
      <p>
        Call a demo tool, resource, and prompt. Forecasts are static examples.
      </p>
      <Button disabled={pending} onClick={() => void runDemo()}>
        {pending ? 'Calling…' : 'Call the server'}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="space-y-4" aria-live="polite">
          <section>
            <h2 className="font-semibold">Forecast</h2>
            <p>{result.forecast}</p>
          </section>
          <section>
            <h2 className="font-semibold">City guide</h2>
            <pre className="whitespace-pre-wrap">{result.guide}</pre>
          </section>
          <section>
            <h2 className="font-semibold">Trip brief prompt</h2>
            <p>{result.brief}</p>
          </section>
        </div>
      )}
    </main>
  )
}
