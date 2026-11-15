// Matching rules ported from clairs-io; keep retrieval and transport outside this module.
import type { Unit as AppfolioUnit } from './schemas'

export type AppfolioUnitAddressInput = {
  city: string
  postalCode?: string | null
  state?: string | null
  streetAddress: string
  unit?: string | null
}

export type AppfolioUnitAddressDiagnostics = {
  cityMatched: boolean
  postalCodeMatched: boolean
  stateMatched: boolean
  streetMatched: boolean
  unitMatched: boolean
  unitRequired: boolean
}

export type AppfolioUnitAddressMatch = {
  diagnostics: AppfolioUnitAddressDiagnostics
  matches: boolean
  needsReview: boolean
  normalized: {
    input: NormalizedAddress
    unit: NormalizedAddress
  }
}

type NormalizedAddress = {
  city: string | undefined
  display: string
  postalCode: string | undefined
  state: string | undefined
  street: string | undefined
  unit: string | undefined
}

const streetSuffixes = new Map([
  ['avenue', 'ave'],
  ['ave', 'ave'],
  ['boulevard', 'blvd'],
  ['blvd', 'blvd'],
  ['court', 'ct'],
  ['ct', 'ct'],
  ['drive', 'dr'],
  ['dr', 'dr'],
  ['road', 'rd'],
  ['rd', 'rd'],
  ['street', 'st'],
  ['st', 'st'],
  ['suite', 'ste'],
  ['ste', 'ste'],
  ['way', 'way'],
])

const delimitedUnitPattern = /(?:,|-)\s*#?\s*([a-z0-9]+)$/i
const directionalUnitPattern = /(?:^|[\s,/#-])(lower|upper)\s+unit$/i
const hashUnitPattern = /(?:^|[\s,/-])#\s*([a-z0-9]+)$/i
const labeledUnitPattern =
  /(?:^|[\s,/#-])(?:apt|apartment|unit|suite|ste|room|rm)\s*#?\s*([a-z0-9]+)$/i
const standaloneDirectionalUnitPattern = /^(lower|upper)\s+unit$/i
const standaloneLabeledUnitPattern =
  /^(?:apt|apartment|unit|suite|ste|room|rm)\s*#?\s*([a-z0-9]+)$/i

export function normalizeAppfolioUnitAddress(
  unit: AppfolioUnit,
): NormalizedAddress {
  const parsed = parseStreetAndUnit(unit.Address1)

  return {
    ...normalizeAddress({
      city: unit.City,
      postalCode: unit.Zip,
      state: unit.State,
      streetAddress: parsed.street ?? unit.Address1 ?? undefined,
      unit: parsed.unit,
    }),
    display: formatDisplayAddress(unit),
  }
}

export function addressMatchesAppfolioUnit(
  input: AppfolioUnitAddressInput,
  unit: AppfolioUnit,
): AppfolioUnitAddressMatch {
  const normalizedInput = normalizeAddress(input)
  const normalizedUnit = normalizeAppfolioUnitAddress(unit)
  const unitRequired = normalizedUnit.unit !== undefined
  const diagnostics = {
    cityMatched: normalizedInput.city === normalizedUnit.city,
    postalCodeMatched: normalizedInput.postalCode === normalizedUnit.postalCode,
    stateMatched: normalizedInput.state === normalizedUnit.state,
    streetMatched: streetsMatch(normalizedInput.street, normalizedUnit.street),
    unitMatched: unitRequired
      ? normalizedInput.unit === normalizedUnit.unit
      : normalizedInput.unit === undefined,
    unitRequired,
  }
  const needsReview =
    normalizedUnit.street === undefined ||
    normalizedUnit.city === undefined ||
    (unitRequired && normalizedInput.unit === undefined)

  return {
    diagnostics,
    matches:
      diagnostics.streetMatched &&
      diagnostics.unitMatched &&
      diagnostics.cityMatched &&
      !needsReview,
    needsReview,
    normalized: {
      input: normalizedInput,
      unit: normalizedUnit,
    },
  }
}

function normalizeAddress(input: {
  city?: string | null
  postalCode?: string | null
  state?: string | null
  streetAddress?: string | null
  unit?: string | null
}): NormalizedAddress {
  const parsed = parseStreetAndUnit(input.streetAddress)

  return {
    city: normalizeText(input.city),
    display: '',
    postalCode: normalizePostalCode(input.postalCode),
    state: normalizeText(input.state),
    street: normalizeStreet(parsed.street ?? input.streetAddress),
    unit: normalizeUnit(input.unit ?? parsed.unit),
  }
}

function parseStreetAndUnit(value: string | null | undefined): {
  street: string | undefined
  unit: string | undefined
} {
  const normalized = value?.trim()

  if (!normalized) {
    return { street: undefined, unit: undefined }
  }

  const match = findTrailingUnit(normalized)

  if (!match) {
    return { street: normalized, unit: undefined }
  }

  return {
    street: normalized.slice(0, match.index).replace(/[\s,#-]+$/, ''),
    unit: match.unit,
  }
}

function normalizeStreet(value: string | null | undefined): string | undefined {
  const normalized = normalizeText(value)
    ?.replace(/[.,]/g, '')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')

  if (!normalized) {
    return undefined
  }

  return normalized
    .split(' ')
    .map((part) => streetSuffixes.get(part) ?? part)
    .join(' ')
}

function streetsMatch(
  inputStreet: string | undefined,
  unitStreet: string | undefined,
): boolean {
  if (inputStreet === unitStreet) {
    return true
  }

  return streetNumberIsInRange(inputStreet, unitStreet)
}

function streetNumberIsInRange(
  street: string | undefined,
  rangeStreet: string | undefined,
): boolean {
  const parsedStreet = parseSingleNumberStreet(street)
  const parsedRange = parseNumberRangeStreet(rangeStreet)

  if (!parsedStreet || !parsedRange) {
    return false
  }

  return (
    parsedStreet.name === parsedRange.name &&
    parsedStreet.number >= parsedRange.start &&
    parsedStreet.number <= parsedRange.end
  )
}

function parseSingleNumberStreet(
  value: string | undefined,
): { name: string; number: number } | undefined {
  const match = value?.match(/^(\d+)\s+(.+)$/)
  const number = match?.[1] === undefined ? Number.NaN : Number(match[1])
  const name = match?.[2]

  if (!name || !Number.isSafeInteger(number)) {
    return undefined
  }

  return { name, number }
}

function parseNumberRangeStreet(
  value: string | undefined,
): { end: number; name: string; start: number } | undefined {
  const match = value?.match(/^(\d+)-(\d+)\s+(.+)$/)
  const start = match?.[1] === undefined ? Number.NaN : Number(match[1])
  const end = match?.[2] === undefined ? Number.NaN : Number(match[2])
  const name = match?.[3]

  if (
    !name ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end
  ) {
    return undefined
  }

  return { end, name, start }
}

function normalizeUnit(value: string | null | undefined): string | undefined {
  const normalized = normalizeText(value)

  if (!normalized) {
    return undefined
  }

  const directionalUnit = normalized.match(standaloneDirectionalUnitPattern)
  const labeledUnit = normalized.match(standaloneLabeledUnitPattern)
  const unit = directionalUnit?.[1] ?? labeledUnit?.[1] ?? normalized

  return unit
    .replace(/^[-#\s]+/, '')
    .replace(/\s+unit$/, '')
    .trim()
}

function findTrailingUnit(
  value: string,
): { index: number; unit: string } | undefined {
  for (const pattern of [
    labeledUnitPattern,
    directionalUnitPattern,
    hashUnitPattern,
    delimitedUnitPattern,
  ]) {
    const match = value.match(pattern)
    const unit = match?.[1]

    if (unit && match.index !== undefined && !isStreetSuffix(unit)) {
      return { index: match.index, unit }
    }
  }

  return undefined
}

function isStreetSuffix(value: string): boolean {
  return streetSuffixes.has(value.toLowerCase())
}

function normalizePostalCode(
  value: string | null | undefined,
): string | undefined {
  const match = value?.trim().match(/\d{5}/)

  return match?.[0]
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase()

  return normalized === '' ? undefined : normalized
}

function formatDisplayAddress(unit: AppfolioUnit): string {
  const cityState = [unit.City, unit.State].filter(Boolean).join(', ')
  const locality = [cityState, unit.Zip].filter(Boolean).join(' ')

  return [unit.Address1, unit.Address2, locality].filter(Boolean).join(', ')
}
