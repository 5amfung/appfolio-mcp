// @vitest-environment node
import { it, expect, afterEach, vi } from 'vitest'
import { encrypt, decrypt } from './crypto'
afterEach(() => vi.unstubAllEnvs())
it('authenticates ciphertext, purpose and connection, and supports old key IDs', () => {
  vi.stubEnv(
    'CREDENTIAL_KEYS',
    JSON.stringify({ v1: 'a'.repeat(64), v2: 'b'.repeat(64) }),
  )
  vi.stubEnv('CREDENTIAL_KEY_ID', 'v1')
  expect(decrypt(encrypt('', 'retry:body'), 'retry:body')).toBe('')
  const value = encrypt('private secret', 'connection-a:credentials')
  expect(value).not.toContain('private secret')
  expect(decrypt(value, 'connection-a:credentials')).toBe('private secret')
  expect(() => decrypt(value, 'connection-b:credentials')).toThrow()
  expect(() => decrypt(value, 'connection-a:token')).toThrow()
  vi.stubEnv('CREDENTIAL_KEY_ID', 'v2')
  expect(decrypt(value, 'connection-a:credentials')).toBe('private secret')
  expect(encrypt('private secret', 'connection-a:credentials')).not.toBe(value)
})
