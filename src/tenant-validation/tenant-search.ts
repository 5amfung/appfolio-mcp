// Matching rules ported from clairs-io; keep retrieval and transport outside this module.
import type { Tenant as AppfolioTenant } from './schemas'

export interface AppfolioTenantSearchCriteria {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phoneNumber?: string | null
}

type NormalizedTenantSearchCriteria = {
  email: string | undefined
  firstName: string | undefined
  lastName: string | undefined
  phoneNumber: string | undefined
}

export type AppfolioTenantEvidence = {
  emailMatched: boolean
  firstNameMatched: boolean
  lastNameMatched: boolean
  phoneMatched: boolean
}

export type AppfolioTenantMatch = {
  evidence: AppfolioTenantEvidence
  tenant: AppfolioTenant
}

export function findAppfolioTenantMatches(
  tenants: ReadonlyArray<AppfolioTenant>,
  criteria: AppfolioTenantSearchCriteria,
): Array<AppfolioTenantMatch> {
  const normalizedCriteria = normalizeSearchCriteria(criteria)

  if (Object.values(normalizedCriteria).every((value) => value === undefined)) {
    return []
  }

  return tenants
    .map((tenant) => ({
      evidence: createTenantEvidence(tenant, normalizedCriteria),
      tenant,
    }))
    .filter((match) =>
      tenantEvidenceQualifiesAsCandidate(match.evidence, normalizedCriteria),
    )
}

export function findAppfolioTenants(
  tenants: ReadonlyArray<AppfolioTenant>,
  criteria: AppfolioTenantSearchCriteria,
): Array<AppfolioTenant> {
  return findAppfolioTenantMatches(tenants, criteria).map(
    (match) => match.tenant,
  )
}

function normalizeSearchCriteria(
  criteria: AppfolioTenantSearchCriteria,
): NormalizedTenantSearchCriteria {
  return {
    email: normalizeText(criteria.email),
    firstName: normalizeText(criteria.firstName),
    lastName: normalizeText(criteria.lastName),
    phoneNumber: normalizePhoneNumber(criteria.phoneNumber),
  }
}

function createTenantEvidence(
  tenant: AppfolioTenant,
  criteria: NormalizedTenantSearchCriteria,
): AppfolioTenantEvidence {
  return {
    emailMatched: matchesProvidedValue(
      criteria.email,
      tenant.Emails?.map((email) => email.EmailAddress) ?? [],
    ),
    firstNameMatched: matchesProvidedValue(criteria.firstName, [
      tenant.FirstName,
    ]),
    lastNameMatched: matchesLastName(criteria.lastName, tenant.LastName),
    phoneMatched: matchesProvidedValue(
      criteria.phoneNumber,
      tenant.PhoneNumbers?.map((phoneNumber) =>
        normalizePhoneNumber(phoneNumber.Number),
      ) ?? [],
    ),
  }
}

function matchesProvidedValue(
  expected: string | undefined,
  values: ReadonlyArray<string | null | undefined>,
): boolean {
  if (expected === undefined) {
    return false
  }

  return values.some((value) => normalizeText(value) === expected)
}

function tenantEvidenceQualifiesAsCandidate(
  evidence: AppfolioTenantEvidence,
  criteria: NormalizedTenantSearchCriteria,
): boolean {
  if (criteria.firstName !== undefined) {
    const hasSecondaryCriteria =
      criteria.lastName !== undefined ||
      criteria.email !== undefined ||
      criteria.phoneNumber !== undefined

    if (!hasSecondaryCriteria) {
      return evidence.firstNameMatched
    }

    return (
      evidence.firstNameMatched &&
      (evidence.lastNameMatched ||
        evidence.emailMatched ||
        evidence.phoneMatched)
    )
  }

  return (
    evidence.lastNameMatched || evidence.emailMatched || evidence.phoneMatched
  )
}

function matchesLastName(
  expected: string | undefined,
  actual: string | null | undefined,
): boolean {
  if (expected === undefined) {
    return false
  }

  const normalizedActual = normalizeText(actual)

  if (normalizedActual === undefined) {
    return false
  }

  return (
    normalizedActual === expected ||
    getSurnameToken(normalizedActual) === getSurnameToken(expected)
  )
}

function getSurnameToken(value: string): string {
  return value.replace(/[.]/g, ' ').split(' ').filter(Boolean).at(-1) ?? value
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase()

  return normalized === '' ? undefined : normalized
}

function normalizePhoneNumber(
  value: string | null | undefined,
): string | undefined {
  const normalized = normalizeText(value)

  if (normalized === undefined) {
    return undefined
  }

  const digits = normalized.replace(/\D/g, '')

  return digits === '' ? undefined : digits
}
