import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import stylesUrl from '@/styles.css?url'
import { PostHogAnalytics } from '@/components/posthog-analytics'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: stylesUrl }],
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'AppFolio MCP' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you requested could not be found.</p>
      <Link to="/">Return home</Link>
    </main>
  )
}

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogAnalytics />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
