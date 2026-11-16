// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  catalog,
  inputValidators,
  ajv,
  outputContract,
  rateLimitResponse,
} from './contract'
import {
  serializeUrl,
  serializeBody,
  stableJson,
  boundedResponse,
} from './request'

import { fixture } from '@/test/contract-fixture'

const nullableReadCases = [
  ...['FirstName', 'LastName', 'Emails', 'PhoneNumbers'].map((field) => ({
    operation: 'getTenants',
    field,
    record: { [field]: null },
  })),
  {
    operation: 'getTenants',
    field: 'Emails.EmailAddress',
    record: { Emails: [{ EmailAddress: null }] },
  },
  {
    operation: 'getTenants',
    field: 'PhoneNumbers.Number',
    record: { PhoneNumbers: [{ Number: null }] },
  },
  ...['Address1', 'Address2', 'City', 'Name', 'State', 'Status', 'Zip'].map(
    (field) => ({ operation: 'getUnits', field, record: { [field]: null } }),
  ),
]

describe('nullable tenant and unit read responses', () => {
  it.each(nullableReadCases)(
    '$operation accepts null at $field in runtime and advertised output schemas',
    ({ operation, record }) => {
      const op = catalog.operations.find((item) => item.name === operation)
      if (!op) throw new Error('Missing read operation')
      const data = {
        data: [{ Id: '11111111-1111-4111-8111-111111111111', ...record }],
      }
      const validate = ajv.compile(op.responses['200'])
      expect(validate(data), JSON.stringify(validate.errors)).toBe(true)
      const output = ajv.compile(outputContract(op))
      expect(
        output({
          status: 200,
          data,
          metadata: {
            upstreamStatus: 200,
            retryAfter: null,
            correlationId: 'nullable-read',
          },
        }),
        JSON.stringify(output.errors),
      ).toBe(true)
    },
  )

  it.each([
    { operation: 'getTenants', record: { Id: null } },
    { operation: 'getTenants', record: { Id: 'not-a-uuid' } },
    { operation: 'getTenants', record: { LastName: 123 } },
    { operation: 'getTenants', record: { Emails: 'not-an-array' } },
    { operation: 'getTenants', record: { Emails: [null] } },
    { operation: 'getTenants', record: { PhoneNumbers: [{ Number: false }] } },
    { operation: 'getTenants', record: { OccupancyId: null } },
    { operation: 'getTenants', record: { TenantType: null } },
    { operation: 'getUnits', record: { Id: null } },
    { operation: 'getUnits', record: { Address2: 123 } },
    { operation: 'getUnits', record: { PropertyId: null } },
    { operation: 'getUnits', record: { Status: 'not-a-status' } },
  ])(
    'keeps $operation non-null types, UUIDs and other fields strict: $record',
    ({ operation, record }) => {
      const op = catalog.operations.find((item) => item.name === operation)
      if (!op) throw new Error('Missing read operation')
      const validate = ajv.compile(op.responses['200'])
      expect(validate({ data: [record] })).toBe(false)
    },
  )
})

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
  it('accepts the documented printable ASCII key domain and rejects controls/oversized keys', () => {
    const op = catalog.operations.find(
      (o) => o.name === 'createInventoryLocation',
    )!
    const input = fixture(op.inputSchema) as Record<string, unknown>
    const validate = inputValidators.get(op.name)!
    expect(
      validate({
        ...input,
        idempotencyKey: 'external key / 2026: ' + '.'.repeat(200),
      }),
    ).toBe(true)
    expect(validate({ ...input, idempotencyKey: 'a'.repeat(256) })).toBe(true)
    expect(validate({ ...input, idempotencyKey: '' })).toBe(true)
    expect(validate({ ...input, idempotencyKey: 'a'.repeat(257) })).toBe(false)
    expect(validate({ ...input, idempotencyKey: 'line\nfeed' })).toBe(false)
  })
  it('publishes the normalized rate-limit envelope for every API operation', () => {
    for (const op of catalog.operations) {
      const validate = ajv.compile(outputContract(op))
      expect(
        validate({
          status: 429,
          data: rateLimitResponse,
          metadata: {
            upstreamStatus: 429,
            retryAfter: null,
            correlationId: 'rate-limit-contract',
          },
        }),
        op.name + ': ' + JSON.stringify(validate.errors),
      ).toBe(true)
    }
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
