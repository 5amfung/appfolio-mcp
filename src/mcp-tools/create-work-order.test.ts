// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import * as execution from '@/appfolio/execute'
import { OperationError } from '@/appfolio/execute'
import {
  createWorkOrder,
  createWorkOrderInputSchema,
  createWorkOrderOutputSchema,
} from './create-work-order'

const mocked = { runOperation: vi.spyOn(execution, 'runOperation') }

const identity = {
  userId: 'user',
  grantId: 'grant',
  clientId: 'client',
  correlationId: 'request',
}
const occupancyId = '11111111-1111-4111-8111-111111111111'
const workOrderId = '22222222-2222-4222-8222-222222222222'
const input = {
  description: '  Fix the faucet.  ',
  occupancyId,
  priority: 'Normal',
  idempotencyKey: 'maintenance-123',
}
const metadata = {
  correlationId: 'request',
  idempotencyKey: 'maintenance-123',
  upstreamStatus: 201,
  retryAfter: null,
  idempotentReplayed: false,
}
beforeEach(() => {
  mocked.runOperation.mockReset()
})

it('delegates the constrained create with fixed defaults and the existing retry key', async () => {
  mocked.runOperation.mockResolvedValue({
    status: 201,
    data: { Id: workOrderId, Link: 'https://example.com/work_orders/1' },
    metadata,
  })
  const actual = await createWorkOrder(input, identity)
  expect(mocked.runOperation).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ name: 'createWorkOrder', method: 'POST' }),
    {
      body: {
        JobDescription: 'Fix the faucet.',
        OccupancyId: occupancyId,
        Priority: 'Normal',
        PermissionToEnter: false,
        Status: 'New',
        Type: 'Internal',
      },
      idempotencyKey: 'maintenance-123',
    },
    identity,
  )
  expect(actual.isError).toBe(false)
  expect(actual.structuredContent).toMatchObject({
    status: 'created',
    workOrder: {
      id: workOrderId,
      description: 'Fix the faucet.',
      occupancyId,
      permissionToEnter: false,
      status: 'New',
      type: 'Internal',
    },
    metadata,
  })
  expect(JSON.parse(actual.content[0].text)).toEqual(actual.structuredContent)
  expect(
    createWorkOrderOutputSchema.safeParse(actual.structuredContent).success,
  ).toBe(true)
})

it.each([
  { ...input, occupancyId: undefined },
  { ...input, description: ' ' },
  { ...input, priority: 'Emergency' },
  { ...input, PermissionToEnter: true },
  { ...input, idempotencyKey: '\nsecret' },
])('rejects invalid or overriding input before execution', async (value) => {
  const actual = await createWorkOrder(value, identity)
  expect(actual.structuredContent.status).toBe('needs_more_information')
  expect(mocked.runOperation).not.toHaveBeenCalled()
})

it.each([400, 403, 404, 409, 422])(
  'preserves confirmed rejection for HTTP %s',
  async (status) => {
    mocked.runOperation.mockResolvedValue({
      status,
      data: { code: status, message: 'Rejected' },
      metadata: { ...metadata, upstreamStatus: status },
    })
    const actual = await createWorkOrder(input, identity)
    expect(actual.structuredContent).toMatchObject({
      status: 'not_created',
      error: { failureClass: 'appfolio_rejected' },
      metadata: { idempotencyKey: 'maintenance-123' },
    })
  },
)

it('preserves rate-limit retry timing', async () => {
  mocked.runOperation.mockResolvedValue({
    status: 429,
    data: {},
    metadata: { ...metadata, upstreamStatus: 429, retryAfter: '30' },
  })
  const actual = await createWorkOrder(input, identity)
  expect(actual.structuredContent).toMatchObject({
    status: 'service_unavailable',
    metadata: { retryAfter: '30', idempotencyKey: 'maintenance-123' },
  })
})

it.each([
  'write_outcome_unknown_confirm_upstream_before_retry',
  'upstream_invalid_json',
  'upstream_contract_mismatch',
])('never reports %s as a confirmed non-creation', async (error) => {
  const failure = new OperationError(error, 502, 'maintenance-123')
  mocked.runOperation.mockRejectedValue(failure)
  const actual = await createWorkOrder(input, identity)
  expect(actual.structuredContent).toMatchObject({
    status: 'outcome_unknown',
    error: { failureClass: 'write_outcome_unknown' },
    metadata: { idempotencyKey: 'maintenance-123', errorCategory: error },
  })
  expect(actual.isError).toBe(true)
})

it('treats an upstream server failure as an uncertain write and does not retry', async () => {
  mocked.runOperation.mockResolvedValue({
    status: 503,
    data: {},
    metadata: { ...metadata, upstreamStatus: 503 },
  })
  expect(
    (await createWorkOrder(input, identity)).structuredContent.status,
  ).toBe('outcome_unknown')
  expect(mocked.runOperation).toHaveBeenCalledOnce()
})

it('preserves uncertainty when a server-failure response body cannot be read', async () => {
  mocked.runOperation.mockRejectedValue(
    new OperationError('tool_execution_failed', 500, 'maintenance-123', 503),
  )
  const actual = await createWorkOrder(input, identity)
  expect(actual.structuredContent).toMatchObject({
    status: 'outcome_unknown',
    metadata: { idempotencyKey: 'maintenance-123', upstreamStatus: 503 },
  })
  expect(mocked.runOperation).toHaveBeenCalledOnce()
})

it('does not report success when the create response lacks a valid work-order ID', async () => {
  mocked.runOperation.mockResolvedValue({ status: 201, data: {}, metadata })
  expect(
    (await createWorkOrder(input, identity)).structuredContent.status,
  ).toBe('outcome_unknown')
})

it('rejects contradictory success and failure output', () => {
  expect(
    createWorkOrderOutputSchema.safeParse({
      status: 'created',
      message: 'Created',
      metadata,
      error: { failureClass: 'appfolio_rejected' },
    }).success,
  ).toBe(false)
  expect(
    createWorkOrderInputSchema.safeParse({
      description: 'Fix',
      occupancyId,
      priority: 'Low',
    }).success,
  ).toBe(true)
})
