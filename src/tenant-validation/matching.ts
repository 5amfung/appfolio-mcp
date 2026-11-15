import { z } from 'zod'
import {
  findAppfolioTenantMatches,
  type AppfolioTenantEvidence,
} from './tenant-search'
import {
  addressMatchesAppfolioUnit,
  normalizeAppfolioUnitAddress,
} from './unit-address'
import type {
  MatchedRule,
  MatchSummary,
  Tenant,
  Unit,
  ValidateTenantInput,
  ValidateTenantOutput,
} from './schemas'

export function emptyMatchSummary(): MatchSummary {
  return {
    matchingPairCount: 0,
    tenantCandidateCount: 0,
    unitCandidateCount: 0,
  }
}

function matchedRule(
  evidence: AppfolioTenantEvidence,
  address: ReturnType<typeof addressMatchesAppfolioUnit>,
): MatchedRule | undefined {
  if (!address.matches || !evidence.firstNameMatched) return undefined
  if (
    evidence.lastNameMatched &&
    evidence.emailMatched &&
    evidence.phoneMatched
  )
    return 'first_last_email_phone_address'
  if (evidence.lastNameMatched && evidence.phoneMatched)
    return 'first_last_phone_address'
  if (evidence.lastNameMatched && evidence.emailMatched)
    return 'first_last_email_address'
  if (evidence.emailMatched) return 'first_email_address'
  if (evidence.phoneMatched) return 'first_phone_address'
  return undefined
}

export function evaluateTenant(
  input: ValidateTenantInput,
  tenants: readonly Tenant[],
  units: readonly Unit[],
): ValidateTenantOutput {
  const candidates = findAppfolioTenantMatches(tenants, input)
  // A snapshot contains units for every tenant. Diagnostics count only this search's candidates.
  const unitIds = new Set(candidates.map(({ tenant }) => tenant.UnitId))
  const candidateUnits = units.filter((unit) => unitIds.has(unit.Id))
  const unitsById = new Map(candidateUnits.map((unit) => [unit.Id, unit]))
  const checks = candidates.flatMap((candidate) => {
    const unit = candidate.tenant.UnitId
      ? unitsById.get(candidate.tenant.UnitId)
      : undefined
    if (!unit) return []
    const address = addressMatchesAppfolioUnit(input.address, unit)
    return [
      {
        ...candidate,
        unit,
        address,
        rule: matchedRule(candidate.evidence, address),
      },
    ]
  })
  const successful = checks.filter(
    (check) =>
      check.tenant.Status === 'Current' &&
      check.address.matches &&
      check.rule !== undefined,
  )
  const diagnostic = successful[0] ?? checks[0]
  const match: MatchSummary = {
    matchingPairCount: successful.length,
    tenantCandidateCount: candidates.length,
    unitCandidateCount: candidateUnits.length,
    ...(diagnostic
      ? { address: diagnostic.address.diagnostics, tenant: diagnostic.evidence }
      : {}),
  }
  // Preserve production precedence: unresolved candidates veto an otherwise unique match.
  if (
    candidates.some(
      ({ tenant }) =>
        tenant.Status === 'Current' &&
        (!tenant.UnitId || !unitsById.has(tenant.UnitId)),
    )
  ) {
    return {
      status: 'needs_review',
      error: { failureClass: 'unit_not_found' },
      match,
      message: 'Tenant validation needs manual review.',
    }
  }
  if (
    checks.some((check) => check.address.needsReview) ||
    successful.length > 1
  ) {
    return {
      status: 'needs_review',
      error: { failureClass: 'ambiguous_match' },
      match,
      message: 'Tenant validation needs manual review.',
    }
  }
  const pair = successful[0]
  if (pair && successful.length === 1 && pair.rule) {
    const occupancy = z.uuid().safeParse(pair.tenant.OccupancyId)
    if (!occupancy.success)
      return {
        status: 'needs_review',
        error: { failureClass: 'missing_occupancy_id' },
        match,
        message:
          'The tenant matched, but a valid occupancy ID is required for work-order creation.',
      }
    const normalizedAddress = normalizeAppfolioUnitAddress(pair.unit)
    return {
      status: 'authenticated',
      message: 'Current tenant matched and ready for work-order creation.',
      matchedRule: pair.rule,
      match: { ...match, matchedRule: pair.rule },
      tenant: {
        firstName: pair.tenant.FirstName,
        id: pair.tenant.Id,
        lastName: pair.tenant.LastName,
        occupancyId: occupancy.data,
        primaryTenant: pair.tenant.PrimaryTenant,
        status: 'Current',
        tenantType: pair.tenant.TenantType,
      },
      unit: {
        id: pair.unit.Id,
        name: pair.unit.Name,
        propertyId: pair.unit.PropertyId,
        status: pair.unit.Status,
        address: {
          city: pair.unit.City,
          display: normalizedAddress.display,
          postalCode: pair.unit.Zip,
          state: pair.unit.State,
          streetAddress: pair.unit.Address1,
          unit: normalizedAddress.unit,
        },
      },
    }
  }
  return {
    status: 'not_authenticated',
    match,
    message: 'Tenant validation did not match current AppFolio records.',
    error: {
      failureClass: checks.some(
        (check) => check.tenant.Status !== 'Current' && check.address.matches,
      )
        ? 'not_current_tenant'
        : candidates.length === 0
          ? 'tenant_not_found'
          : 'address_mismatch',
    },
  }
}
