import { createServerOnlyFn } from '@tanstack/react-start'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { jwt } from 'better-auth/plugins/jwt'
import { mcp } from '@better-auth/mcp'
import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { getPool } from '@/db/index.server'
import { activeGrant, grantClaim, selectedGrant } from './grants'

export function appUrl() {
  const url = process.env.BETTER_AUTH_URL
  if (!url)
    throw new Error('BETTER_AUTH_URL must be configured for this environment')
  return url.replace(/\/$/, '')
}
function createAuth() {
  return betterAuth({
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: getPool(),
    disabledPaths: ['/token'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    logger: { disabled: true },
    plugins: [
      jwt({ disableSettingJwtHeader: true }),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource: `${appUrl()}/api/mcp`,
        scopes: ['mcp:tools', 'offline_access'],
        grantTypes: ['authorization_code', 'refresh_token'],
        accessTokenExpiresIn: 900,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        refreshTokenReuseInterval: 0,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: 'infer',
        clientPrivileges: ({ action }) =>
          action === 'create' || action === 'read',
        resourcePrivileges: () => false,
        postLogin: {
          page: '/select-connection',
          shouldRedirect: async ({ user, session }) =>
            !(await selectedGrant(user?.id, session?.id)),
          consentReferenceId: async ({ user, session }) => {
            const g = await selectedGrant(user?.id, session?.id)
            if (!g)
              throw new APIError('BAD_REQUEST', {
                message: 'Select a connection for this authorization',
              })
            return g.id
          },
        },
        customAccessTokenClaims: async ({ user, referenceId }) => {
          if (!user || !referenceId)
            throw new APIError('UNAUTHORIZED', {
              message: 'Authorization binding required',
            })
          await activeGrant(referenceId, user.id)
          return { [grantClaim]: referenceId }
        },
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  })
}
let instance: ReturnType<typeof createAuth> | undefined
export const getAuth = createServerOnlyFn(() => (instance ??= createAuth()))
