import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'

const keysSchema = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i))
function keyring() {
  const keys = keysSchema.parse(JSON.parse(process.env.CREDENTIAL_KEYS ?? '{}'))
  const active = process.env.CREDENTIAL_KEY_ID ?? 'v1'
  const key = keys[active]
  if (!key) throw new Error('Credential encryption key is unavailable')
  return { keys, active, key }
}
export function encrypt(value: string, context: string) {
  const { active, key } = keyring()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ])
  return [
    active,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}
export function decrypt(envelope: string, context: string) {
  const [id, iv, tag, ciphertext] = envelope.split('.')
  const { keys } = keyring()
  if (!id || !iv || !tag || ciphertext === undefined || !keys[id])
    throw new Error('Invalid encrypted value')
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keys[id], 'hex'),
    Buffer.from(iv, 'base64url'),
  )
  cipher.setAAD(Buffer.from(context))
  cipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    cipher.update(Buffer.from(ciphertext, 'base64url')),
    cipher.final(),
  ]).toString('utf8')
}
