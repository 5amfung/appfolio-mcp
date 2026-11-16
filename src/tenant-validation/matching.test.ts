import { describe, expect, it } from 'vitest'
import { evaluateTenant, findTenantCandidates } from './matching'
import { addressMatchesAppfolioUnit } from './unit-address'
import {
  tenantSchema,
  unitSchema,
  validateTenantInputSchema,
  validateTenantOutputSchema,
  type Tenant,
  type Unit,
  type ValidateTenantInput,
} from './schemas'

const tenantId = '11111111-1111-4111-8111-111111111111'
const unitId = '22222222-2222-4222-8222-222222222222'
const occupancyId = '33333333-3333-4333-8333-333333333333'
const tenant: Tenant = {
  Id: tenantId,
  UnitId: unitId,
  OccupancyId: occupancyId,
  FirstName: 'Avery',
  LastName: 'C. Kwan',
  Status: 'Current',
  PhoneNumbers: [{ Number: '(415) 555-0101' }],
  Emails: [{ EmailAddress: 'avery@example.com' }],
}
const unit: Unit = {
  Id: unitId,
  Address1: '960 Market Street #709',
  City: 'San Francisco',
  State: 'CA',
  Zip: '94102',
}
const input: ValidateTenantInput = {
  firstName: 'Avery',
  lastName: 'Kwan',
  phoneNumber: '4155550101',
  email: 'avery@example.com',
  address: {
    streetAddress: '960 Market St.',
    city: 'San Francisco',
    unit: '709',
    state: 'CA',
    postalCode: '94102',
  },
}
function evaluate(
  evidence: ValidateTenantInput = input,
  tenants: Tenant[] = [tenant],
  units: Unit[] = [unit],
) {
  const result = evaluateTenant(evidence, tenants, units)
  // Every branch must conform to the actual advertised output contract.
  expect(validateTenantOutputSchema.safeParse(result).success).toBe(true)
  return result
}

describe('work-order-ready tenant matching', () => {
  it('returns a required valid occupancy ID for one matching current tenant', () => {
    expect(evaluate()).toMatchObject({
      status: 'authenticated',
      matchedRule: 'first_last_email_phone_address',
      tenant: { id: tenantId, occupancyId, status: 'Current' },
      unit: { id: unitId },
      match: {
        matchingPairCount: 1,
        tenantCandidateCount: 1,
        unitCandidateCount: 1,
      },
    })
  })

  it.each([undefined, null, '', 'not-an-occupancy'])(
    'requires review for missing or invalid occupancy %s',
    (value) => {
      const result = evaluate(input, [{ ...tenant, OccupancyId: value }])
      expect(result).toMatchObject({
        status: 'needs_review',
        error: { failureClass: 'missing_occupancy_id' },
      })
      expect(result).not.toHaveProperty('tenant')
      expect(result).not.toHaveProperty('unit')
      expect(result).not.toHaveProperty('matchedRule')
    },
  )

  it.each(['Past', 'Future', 'Notice', 'Evict', undefined])(
    'does not accept a tenant with status %s',
    (status) => {
      expect(evaluate(input, [{ ...tenant, Status: status }])).toMatchObject({
        status: 'not_authenticated',
        error: { failureClass: 'not_current_tenant' },
      })
    },
  )

  it('requires review when two current tenants match, even if only one has an occupancy', () => {
    const second = {
      ...tenant,
      Id: '44444444-4444-4444-8444-444444444444',
      OccupancyId: undefined,
    }
    expect(evaluate(input, [tenant, second])).toMatchObject({
      status: 'needs_review',
      error: { failureClass: 'ambiguous_match' },
    })
  })

  it('requires review for any unresolved current candidate unit before accepting another pair', () => {
    const unresolved = {
      ...tenant,
      Id: '44444444-4444-4444-8444-444444444444',
      UnitId: undefined,
    }
    expect(evaluate(input, [tenant, unresolved])).toMatchObject({
      status: 'needs_review',
      error: { failureClass: 'unit_not_found' },
    })
  })

  it('requires review when any candidate address is incomplete', () => {
    const secondId = '55555555-5555-4555-8555-555555555555'
    const secondTenant = {
      ...tenant,
      Id: '44444444-4444-4444-8444-444444444444',
      UnitId: secondId,
    }
    const secondUnit = { ...unit, Id: secondId, City: undefined }
    expect(
      evaluate(input, [tenant, secondTenant], [unit, secondUnit]),
    ).toMatchObject({
      status: 'needs_review',
      error: { failureClass: 'ambiguous_match' },
    })
  })

  it('reports only candidate units in a full cached inventory', () => {
    const unrelated = { ...unit, Id: '55555555-5555-4555-8555-555555555555' }
    expect(evaluate(input, [tenant], [unit, unrelated])).toMatchObject({
      match: { unitCandidateCount: 1 },
    })
  })

  it('does not disclose records when no identity candidates match', () => {
    const result = evaluate({ ...input, firstName: 'Someone Else' })
    expect(result).toMatchObject({
      status: 'not_authenticated',
      error: { failureClass: 'tenant_not_found' },
    })
    expect(result).not.toHaveProperty('tenant')
    expect(result).not.toHaveProperty('unit')
  })

  it('does not accept a matching name and address without email or phone', () => {
    expect(
      evaluate({
        ...input,
        email: 'other@example.com',
        phoneNumber: '0000000000',
      }),
    ).toMatchObject({ status: 'not_authenticated' })
  })

  it('does not accept a matching email, phone and address with a different first name', () => {
    expect(evaluate({ ...input, firstName: 'Other' })).toMatchObject({
      status: 'not_authenticated',
    })
  })

  it('preserves acceptance on phone when optional email mismatches', () => {
    expect(evaluate({ ...input, email: 'other@example.com' })).toMatchObject({
      status: 'authenticated',
      matchedRule: 'first_last_phone_address',
    })
  })

  it('does not accept email and surname when supplied phone mismatches', () => {
    expect(evaluate({ ...input, phoneNumber: '0000000000' })).toMatchObject({
      status: 'not_authenticated',
      error: { failureClass: 'tenant_not_found' },
      match: { tenantCandidateCount: 0, unitCandidateCount: 0 },
    })
  })

  it('accepts first name, phone and address without a surname', () => {
    expect(
      evaluate({ ...input, lastName: undefined, email: undefined }),
    ).toMatchObject({
      status: 'authenticated',
      matchedRule: 'first_phone_address',
    })
  })

  it('accepts first name, phone and address when optional surname differs', () => {
    expect(
      evaluate({ ...input, lastName: 'Other', email: undefined }),
    ).toMatchObject({
      status: 'authenticated',
      matchedRule: 'first_phone_address',
      match: {
        tenant: {
          firstNameMatched: true,
          phoneMatched: true,
          lastNameMatched: false,
        },
      },
    })
  })

  it('ignores an unresolved unit belonging to a name-only candidate with another phone', () => {
    const otherPhone = {
      ...tenant,
      Id: '44444444-4444-4444-8444-444444444444',
      UnitId: undefined,
      PhoneNumbers: [{ Number: '0000000000' }],
    }
    expect(evaluate(input, [tenant, otherPhone])).toMatchObject({
      status: 'authenticated',
      match: { tenantCandidateCount: 1, unitCandidateCount: 1 },
    })
  })

  it('preserves country-code-sensitive phone comparison', () => {
    expect(
      evaluate({ ...input, email: undefined, phoneNumber: '+1 415 555 0101' }),
    ).toMatchObject({ status: 'not_authenticated' })
  })

  it('normalizes case, whitespace, phone punctuation and surname initials', () => {
    expect(
      evaluate({
        ...input,
        firstName: '  AVERY  ',
        email: ' AVERY@EXAMPLE.COM ',
        phoneNumber: '(415) 555-0101',
      }),
    ).toMatchObject({
      status: 'authenticated',
      matchedRule: 'first_last_email_phone_address',
    })
  })
})

describe('name-and-phone candidate selection', () => {
  it('selects only tenants with both matching first name and phone before units are needed', () => {
    const candidates = findTenantCandidates(input, [
      tenant,
      {
        ...tenant,
        Id: '44444444-4444-4444-8444-444444444444',
        FirstName: 'Other',
      },
      {
        ...tenant,
        Id: '55555555-5555-4555-8555-555555555555',
        PhoneNumbers: [{ Number: '0000000000' }],
      },
    ])
    expect(candidates.map(({ tenant }) => tenant.Id)).toEqual([tenantId])
  })

  it.each([
    ['different first name', { ...input, firstName: 'Other' }],
    ['different phone', { ...input, phoneNumber: '0000000000' }],
    [
      'email without a matching phone',
      { ...input, lastName: undefined, phoneNumber: '0000000000' },
    ],
    [
      'first name and surname without a matching phone',
      { ...input, email: undefined, phoneNumber: '0000000000' },
    ],
  ])('does not select a candidate for %s', (_name, evidence) => {
    expect(findTenantCandidates(evidence, [tenant])).toEqual([])
  })
})

describe('production address policy', () => {
  it.each([
    ['960 Market Street', '960 Market St.'],
    ['960 Market Avenue', '960 Market Ave'],
    ['960 Market Boulevard', '960 Market Blvd.'],
  ])('normalizes suffixes in %s', (stored, supplied) => {
    expect(
      addressMatchesAppfolioUnit(
        { streetAddress: supplied, city: 'San Francisco' },
        { ...unit, Address1: stored },
      ).matches,
    ).toBe(true)
  })

  it.each(['#709', 'Apartment 709', 'Apt 709', 'Unit 709', ', 709'])(
    'accepts explicit unit form %s',
    (suffix) => {
      const address = {
        ...input.address,
        streetAddress: '960 Market Street ' + suffix,
        unit: undefined,
      }
      expect(evaluate({ ...input, address })).toMatchObject({
        status: 'authenticated',
      })
    },
  )

  it('requires review when the required unit is omitted', () => {
    expect(
      evaluate({ ...input, address: { ...input.address, unit: undefined } }),
    ).toMatchObject({
      status: 'needs_review',
      error: { failureClass: 'ambiguous_match' },
    })
  })

  it('rejects a different unit and a different city', () => {
    for (const address of [
      { ...input.address, unit: '710' },
      { ...input.address, city: 'Oakland' },
    ]) {
      expect(evaluate({ ...input, address })).toMatchObject({
        status: 'not_authenticated',
        error: { failureClass: 'address_mismatch' },
      })
    }
  })

  it('keeps state and postal code as diagnostics rather than acceptance requirements', () => {
    expect(
      evaluate({
        ...input,
        address: { ...input.address, state: 'NY', postalCode: '10001' },
      }),
    ).toMatchObject({
      status: 'authenticated',
      match: { address: { stateMatched: false, postalCodeMatched: false } },
    })
  })

  it('accepts a street number inside an AppFolio building range', () => {
    expect(
      evaluate(
        {
          ...input,
          address: { ...input.address, streetAddress: '962 Market St.' },
        },
        [tenant],
        [{ ...unit, Address1: '960-970 Market Street #709' }],
      ),
    ).toMatchObject({ status: 'authenticated' })
  })

  it('accepts null unit when the property address contains no unit', () => {
    expect(
      evaluate(
        { ...input, address: { ...input.address, unit: null } },
        [tenant],
        [{ ...unit, Address1: '960 Market Street' }],
      ),
    ).toMatchObject({ status: 'authenticated' })
  })
})

describe('tenant validation contracts', () => {
  it('rejects incomplete evidence, invalid email and connection overrides', () => {
    for (const value of [
      { ...input, firstName: '' },
      { ...input, phoneNumber: '' },
      { ...input, email: 'invalid' },
      { ...input, connectionId: 'other' },
      { ...input, address: { ...input.address, city: '' } },
    ]) {
      expect(validateTenantInputSchema.safeParse(value).success).toBe(false)
    }
  })

  it('rejects success without an occupancy ID or with failure details', () => {
    const result = evaluate()
    if (result.status !== 'authenticated') throw new Error('Fixture must match')
    expect(
      validateTenantOutputSchema.safeParse({
        ...result,
        tenant: { ...result.tenant, occupancyId: undefined },
      }).success,
    ).toBe(false)
    expect(
      validateTenantOutputSchema.safeParse({
        ...result,
        error: { failureClass: 'address_mismatch' },
      }).success,
    ).toBe(false)
  })

  it('strips unrelated upstream personal information before caching', () => {
    const parsed = tenantSchema.parse({
      ...tenant,
      SocialSecurityNumber: 'sensitive',
      BirthDate: '2000-01-01',
      Emails: [{ EmailAddress: 'avery@example.com', IsPrimary: true }],
    })
    expect(parsed).not.toHaveProperty('SocialSecurityNumber')
    expect(parsed).not.toHaveProperty('BirthDate')
    expect(parsed.Emails?.[0]).not.toHaveProperty('IsPrimary')
    expect(
      unitSchema.parse({ ...unit, MaintenanceNotes: 'private' }),
    ).not.toHaveProperty('MaintenanceNotes')
  })
})
