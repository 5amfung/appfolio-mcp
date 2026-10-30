import { readFile, writeFile } from 'node:fs/promises'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

const filePath = 'count.txt'

async function readCount() {
  try {
    return Number.parseInt(await readFile(filePath, 'utf-8'), 10)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

const getCount = createServerFn({ method: 'GET' }).handler(readCount)

const updateCount = createServerFn({ method: 'POST' })
  .validator((value: number) => {
    if (value !== 1) throw new Error('Counter increments must be 1')
    return value
  })
  .handler(async ({ data }) => {
    const count = await readCount()
    await writeFile(filePath, `${count + data}`)
  })

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => getCount(),
})

function Home() {
  const router = useRouter()
  const count = Route.useLoaderData()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function increment() {
    setPending(true)
    setError(null)
    try {
      await updateCount({ data: 1 })
      await router.invalidate()
    } catch {
      setError('Unable to update the counter. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main>
      <h1>AppFolio MCP</h1>
      <p>TanStack Start starter</p>
      <button type="button" disabled={pending} onClick={increment}>
        {pending ? 'Adding…' : `Add 1 to ${count}?`}
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
