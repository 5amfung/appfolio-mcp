import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCount, updateCount, invalidate, useLoaderData } = vi.hoisted(() => ({
  getCount: vi.fn(),
  updateCount: vi.fn(),
  invalidate: vi.fn(),
  useLoaderData: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: ({ method }: { method: string }) => ({
    validator: () => ({ handler: () => updateCount }),
    handler: () => (method === 'GET' ? getCount : updateCount),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({ options, useLoaderData }),
  useRouter: () => ({ invalidate }),
}))

import { Route } from './index'

function renderHome() {
  const Home = Route.options.component!
  return render(<Home />)
}

describe('index route', () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue(4)
    updateCount.mockResolvedValue(undefined)
    invalidate.mockResolvedValue(undefined)
  })

  it('loads the counter through the GET server function', async () => {
    getCount.mockResolvedValueOnce(4)

    const loader = Route.options.loader
    if (typeof loader !== 'function') throw new Error('Expected a route loader')
    expect(await loader({} as never)).toBe(4)
    expect(getCount).toHaveBeenCalledOnce()
  })

  it('renders the page and the loaded count', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: 'AppFolio MCP' })).toBeVisible()
    expect(screen.getByText('TanStack Start starter')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add 1 to 4?' })).toBeEnabled()
  })

  it('disables the button while updating and refreshes the route afterward', async () => {
    const user = userEvent.setup()
    let finishUpdate!: () => void
    updateCount.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishUpdate = resolve
      }),
    )
    renderHome()

    await user.click(screen.getByRole('button', { name: 'Add 1 to 4?' }))

    expect(updateCount).toHaveBeenCalledExactlyOnceWith({ data: 1 })
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    expect(invalidate).not.toHaveBeenCalled()

    useLoaderData.mockReturnValue(5)
    finishUpdate()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add 1 to 5?' })).toBeEnabled()
    })
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('shows an update error and clears it on a successful retry', async () => {
    const user = userEvent.setup()
    updateCount.mockRejectedValueOnce(new Error('Update failed'))
    renderHome()

    await user.click(screen.getByRole('button', { name: 'Add 1 to 4?' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update the counter. Please try again.',
    )
    expect(invalidate).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeEnabled()

    await user.click(screen.getByRole('button'))

    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeEnabled()
  })
})
