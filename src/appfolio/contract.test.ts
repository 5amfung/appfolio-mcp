// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { catalog, inputValidators, ajv } from './contract'
import {
  serializeUrl,
  serializeBody,
  stableJson,
  boundedResponse,
} from './request'

import { fixture } from '@/test/contract-fixture'

describe('complete operation contract', () => {
  it('contains every method and path exactly once with unique stable names', () => {
    expect(catalog.operations).toHaveLength(181)
    expect(new Set(catalog.operations.map((o) => o.name)).size).toBe(181)
    expect(
      Object.fromEntries(
        ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'].map((m) => [
          m,
          catalog.operations.filter((o) => o.method === m).length,
        ]),
      ),
    ).toEqual({ GET: 68, POST: 66, PATCH: 36, DELETE: 6, PUT: 5 })
  })
  for (const op of catalog.operations)
    it(`${op.name}: validates input, constructs trusted request and compiles responses`, () => {
      const input = fixture(op.inputSchema) as {
        path?: Record<string, unknown>
        query?: Record<string, unknown>
        body?: unknown
      }
      if (op.name === 'getWorkOrders')
        input.query = { filters: { LastUpdatedAtFrom: '2026-01-01T00:00:00Z' } }
      const validate = inputValidators.get(op.name)!
      expect(validate(input), JSON.stringify(validate.errors)).toBe(true)
      const request = serializeUrl(op, input)
      const url = new URL(request.url)
      expect(url.origin).toBe('https://api.appfolio.com')
      expect(url.pathname).not.toContain('{')
      expect(request.headers.has('authorization')).toBe(false)
      const body = serializeBody(op, input)
      expect(body.bytes.length).toBeLessThanOrEqual(2_097_152)
      for (const response of Object.values(op.responses))
        expect(() => ajv.compile(response)).not.toThrow()
    })
  it('requires a work-order ID or updated-since filter', () => {
    const validate = inputValidators.get('getWorkOrders')!
    expect(validate({})).toBe(false)
    expect(validate({ query: { filters: {} } })).toBe(false)
    expect(
      validate({
        query: { filters: { LastUpdatedAtFrom: '2026-01-01T00:00:00Z' } },
      }),
    ).toBe(true)
  })
  it('cannot accept credential, URL or connection overrides', () => {
    for (const op of catalog.operations)
      for (const override of [
        'connectionId',
        'userId',
        'url',
        'credentials',
        'authorization',
      ])
        expect(inputValidators.get(op.name)!({ [override]: 'attack' })).toBe(
          false,
        )
  })
  it('serializes deep object filters and encoded path values', () => {
    const op = catalog.operations.find((o) => o.name === 'getWorkOrders')!
    const u = new URL(
      serializeUrl(op, {
        query: { filters: { Id: 'a,b' }, page: { number: 2, size: 20 } },
      }).url,
    )
    expect(u.searchParams.get('filters[Id]')).toBe('a,b')
    expect(u.searchParams.get('page[size]')).toBe('20')
  })
  it('transfers file bytes and rejects local path strings', () => {
    const op = catalog.operations.find(
      (o) => o.mediaType === 'multipart/form-data',
    )!
    const body = serializeBody(op, {
      body: {
        File: {
          filename: 'sample.txt',
          mediaType: 'text/plain',
          base64: 'aGVsbG8=',
        },
      },
    })
    expect(body.bytes.toString()).toContain('hello')
    expect(body.bytes.toString()).toContain('filename="sample.txt"')
    expect(() => serializeBody(op, { body: { File: '/etc/passwd' } })).toThrow()
  })
  it('bounds streamed responses and handles empty bodies', async () => {
    await expect(boundedResponse(new Response('123456'), 5)).rejects.toThrow()
    expect(await boundedResponse(new Response(null, { status: 204 }))).toBe('')
  })
  it('canonicalizes logical mutation inputs while retaining values', () => {
    expect(stableJson({ a: 1, b: 2 })).toBe(stableJson({ b: 2, a: 1 }))
    expect(stableJson({ a: 2 })).not.toBe(stableJson({ a: 1 }))
  })
})
