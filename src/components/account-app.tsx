import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import {
  accountRequest,
  accountSchema,
  type Account,
} from '@/lib/account-client'
import { Button } from '@/components/ui/button'

function Field({
  label,
  name,
  type = 'text',
  required = true,
  defaultValue,
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  autoComplete?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-lg border bg-background px-3 py-2.5 outline-offset-2"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        onInput={(event) => {
          const form = event.currentTarget.form
          const confirmation = form?.elements.namedItem('confirmation')
          const password = form?.elements.namedItem('newPassword')
          if (
            confirmation instanceof HTMLInputElement &&
            password instanceof HTMLInputElement
          )
            confirmation.setCustomValidity(
              confirmation.value && confirmation.value !== password.value
                ? 'Passwords must match.'
                : '',
            )
        }}
      />
    </label>
  )
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}
function signedQuery() {
  const params = new URLSearchParams(window.location.search)
  const keys = new Set(['sig', 'ba_param', ...params.getAll('ba_param')])
  return new URLSearchParams(
    [...params].filter(([k]) => keys.has(k)),
  ).toString()
}
export function AccountApp({
  page = 'settings',
}: {
  page?: 'settings' | 'sign-in' | 'consent' | 'select-connection'
}) {
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false),
    [signup, setSignup] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [authorization, setAuthorization] = useState<{
    clientName: string
    redirectHost: string
    scopes: string
    connectionName: string | null
  } | null>(null)
  useEffect(() => {
    if (!account || (page !== 'consent' && page !== 'select-connection')) return
    let cancelled = false
    void accountRequest({ action: 'authorization', oauthQuery: signedQuery() })
      .then((value) => {
        const parsed = z
          .object({
            clientName: z.string(),
            redirectHost: z.string(),
            scopes: z.string(),
            connectionName: z.string().nullable(),
          })
          .parse(value)
        if (!cancelled) setAuthorization(parsed)
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'This authorization request is invalid or expired. Start again from your coding agent.',
          )
      })
    return () => {
      cancelled = true
    }
  }, [account, page])
  async function refresh() {
    try {
      setAccount(accountSchema.parse(await accountRequest()))
    } catch {
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  async function run(action: () => Promise<void>) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Request failed. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget,
      values = new FormData(form)
    await run(async () => {
      const email = String(values.get('email')),
        password = String(values.get('password'))
      const result = signup
        ? await authClient.signUp.email({
            email,
            password,
            name: String(values.get('name')),
          })
        : await authClient.signIn.email({ email, password })
      if (result.error)
        throw new Error(result.error.message ?? 'Unable to sign in')
      form.reset()
      await refresh()
      if (!window.location.search) window.location.assign('/settings')
    })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form))
    const connection = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== ''),
    )
    await run(async () => {
      await accountRequest(
        editing
          ? { action: 'update', connection: { ...connection, id: editing } }
          : { action: 'create', connection },
      )
      form.reset()
      setEditing(null)
      await refresh()
      setNotice('Connection saved.')
    })
  }
  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    await run(async () => {
      const result = z.object({ url: z.string() }).parse(
        await accountRequest({
          action: 'select',
          connectionId: values.get('connectionId'),
          oauthQuery: signedQuery(),
        }),
      )
      window.location.assign(result.url)
    })
  }
  async function consent(accept: boolean) {
    await run(async () => {
      const result = z.object({ url: z.string() }).parse(
        await accountRequest({
          action: 'consent',
          accept,
          oauthQuery: signedQuery(),
        }),
      )
      window.location.assign(result.url)
    })
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form))
    await run(async () => {
      if (values.newPassword !== values.confirmation)
        throw new Error('New passwords must match.')
      await accountRequest({ action: 'password', ...values })
      form.reset()
      setNotice(
        'Password changed. Other browser sessions have been signed out. Your agent authorizations are unchanged.',
      )
    })
  }
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <a className="text-xl font-bold tracking-tight" href="/">
          AppFolio{' '}
          <span className="font-normal text-muted-foreground">MCP</span>
        </a>
        {account && (
          <nav className="flex items-center gap-5 text-sm">
            <a href="/settings">Settings</a>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await authClient.signOut()
                  setAccount(null)
                })
              }
            >
              Sign out
            </Button>
          </nav>
        )}
      </header>
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">
          YOUR PROPERTY DATA, CONNECTED
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {page === 'select-connection'
            ? 'Choose a connection'
            : page === 'consent'
              ? 'Authorize your coding agent'
              : account
                ? 'Account & connections'
                : 'Connect AppFolio to your coding agent'}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Private connections for Cursor, Claude Code, and Codex. Each
          authorization uses one connection you choose.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-4 text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading your account…</p>
      ) : !account ? (
        <div className="max-w-md">
          <Card title={signup ? 'Create your account' : 'Sign in'}>
            <form className="space-y-4" onSubmit={(e) => void login(e)}>
              {signup && (
                <Field name="name" label="Your name" autoComplete="name" />
              )}
              <Field
                name="email"
                label="Email"
                type="email"
                autoComplete="email"
              />
              <Field
                name="password"
                label="Password"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
              {signup && (
                <p className="text-sm text-muted-foreground">
                  Use 12–128 characters. Password recovery is currently
                  unavailable.
                </p>
              )}
              <Button disabled={pending} type="submit">
                {pending
                  ? 'Please wait…'
                  : signup
                    ? 'Create account'
                    : 'Sign in'}
              </Button>
            </form>
            <button
              className="text-sm underline"
              onClick={() => setSignup(!signup)}
            >
              {signup
                ? 'Already have an account? Sign in'
                : 'Create an account'}
            </button>
          </Card>
        </div>
      ) : (
        <>
          {(page === 'select-connection' || page === 'consent') && (
            <Card
              title={
                page === 'select-connection'
                  ? 'Select the AppFolio connection to use'
                  : 'Allow access?'
              }
            >
              {authorization && (
                <div className="space-y-2 rounded-lg border p-4 text-sm">
                  <p>
                    <strong>{authorization.clientName}</strong> requests access.
                  </p>
                  <p>Callback host: {authorization.redirectHost}</p>
                  <p>Requested scopes: {authorization.scopes}</p>
                  {authorization.connectionName && (
                    <p>
                      Selected connection:{' '}
                      <strong>{authorization.connectionName}</strong>
                    </p>
                  )}
                </div>
              )}
              <p>
                The agent can discover all AppFolio tools, including tools that
                change or delete records. Your AppFolio credentials determine
                its actual permissions. It will never receive your credentials.
              </p>
              {page === 'select-connection' ? (
                account.connections.length ? (
                  <form onSubmit={(e) => void choose(e)} className="space-y-4">
                    <fieldset className="space-y-3">
                      <legend className="mb-3 font-medium">Connection</legend>
                      {account.connections.map((c) => (
                        <label
                          className="flex gap-3 rounded-lg border p-4"
                          key={c.id}
                        >
                          <input
                            type="radio"
                            name="connectionId"
                            value={c.id}
                            required
                          />
                          <span>
                            {c.name} · {c.identifierHint}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <Button type="submit" disabled={pending}>
                      Continue to consent
                    </Button>
                  </form>
                ) : (
                  <p>
                    Create a connection below, then return to this selection.
                  </p>
                )
              ) : (
                <div className="flex gap-3">
                  <Button
                    disabled={pending || !authorization?.connectionName}
                    onClick={() => void consent(true)}
                  >
                    Allow access
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => void consent(false)}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </Card>
          )}
          <div className="grid items-start gap-6 md:grid-cols-2">
            <div className="space-y-6">
              <Card title="AppFolio connections">
                {account.connections.length === 0 ? (
                  <p className="text-muted-foreground">
                    Add your first private connection to get started.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {account.connections.map((c) => (
                      <li
                        className="space-y-3 rounded-lg border p-4"
                        key={c.id}
                      >
                        <div>
                          <h3 className="font-semibold">{c.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {c.identifierHint} · Secret hidden
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setEditing(c.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete ${c.name}? Every agent authorization using it will stop working.`,
                                )
                              )
                                void run(async () => {
                                  await accountRequest({
                                    action: 'delete',
                                    id: c.id,
                                  })
                                  await refresh()
                                  setNotice(
                                    'Connection deleted. Its authorizations are disabled.',
                                  )
                                })
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title={editing ? 'Edit connection' : 'Add a connection'}>
                <form
                  key={editing ?? 'new'}
                  onSubmit={(e) => void save(e)}
                  className="space-y-4"
                >
                  <Field
                    name="name"
                    label="Connection name"
                    required={!editing}
                    defaultValue={
                      account.connections.find((c) => c.id === editing)?.name
                    }
                  />
                  <Field
                    name="clientId"
                    label="AppFolio client ID"
                    required={!editing}
                    autoComplete="off"
                  />
                  <Field
                    name="clientSecret"
                    label={
                      editing ? 'New client secret' : 'AppFolio client secret'
                    }
                    type="password"
                    required={!editing}
                    autoComplete="off"
                  />
                  <Field
                    name="databaseId"
                    label="AppFolio database ID"
                    required={!editing}
                    autoComplete="off"
                  />
                  <Field
                    name="developerId"
                    label="AppFolio developer ID"
                    required={!editing}
                    autoComplete="off"
                  />
                  <p className="text-sm text-muted-foreground">
                    {editing
                      ? 'Leave fields empty to keep saved values. Replacing only the secret keeps agent authorizations. Changing an ID requires agents to authorize again.'
                      : 'Credentials stay encrypted on the server. AppFolio checks permissions for each operation.'}
                  </p>
                  <div className="flex gap-3">
                    <Button disabled={pending} type="submit">
                      {pending ? 'Validating…' : 'Save connection'}
                    </Button>
                    {editing && (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </Card>
            </div>
            <div className="space-y-6">
              <Card title="Authorized clients">
                {account.grants.length ? (
                  <ul className="space-y-4">
                    {account.grants.map((g) => (
                      <li className="space-y-2 border-b pb-4" key={g.id}>
                        <h3 className="font-medium">{g.clientName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {g.connectionName} ·{' '}
                          {new Date(g.createdAt).toLocaleDateString()}
                        </p>
                        <Button
                          disabled={pending}
                          variant="outline"
                          onClick={() =>
                            void run(async () => {
                              await accountRequest({
                                action: 'revoke',
                                id: g.id,
                              })
                              await refresh()
                              setNotice(
                                'Authorization removed. Reauthorize the agent to restore access.',
                              )
                            })
                          }
                        >
                          Remove authorization
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No agents authorized yet. Add this site's{' '}
                    <code>/api/mcp</code> URL in your coding agent, then sign in
                    and choose a connection.
                  </p>
                )}
              </Card>
              <Card title="Change password">
                <p className="text-sm text-muted-foreground">
                  Signed in as {account.user.email}. Use 12–128 characters.
                  Other browser sessions will end; agent authorizations stay
                  active.
                </p>
                <form className="space-y-4" onSubmit={(e) => void password(e)}>
                  <Field
                    name="currentPassword"
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                  />
                  <Field
                    name="newPassword"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                  />
                  <Field
                    name="confirmation"
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                  />
                  <Button disabled={pending} type="submit">
                    Change password
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
