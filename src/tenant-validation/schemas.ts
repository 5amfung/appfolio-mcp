import { z } from 'zod'

const text = z.string().nullable().optional()
const tenantTypeSchema = z.enum([
  'Financially Responsible',
  'Other Occupant',
  'Co-signer',
])

// Strip unrelated upstream fields before retaining a shared search snapshot.
export const tenantSchema = z.object({
  Id: z.uuid(),
  FirstName: text,
  LastName: text,
  UnitId: text,
  OccupancyId: text,
  Status: text,
  PrimaryTenant: z.boolean().optional(),
  TenantType: tenantTypeSchema.optional(),
  Emails: z
    .array(z.object({ EmailAddress: text }))
    .nullable()
    .optional(),
  PhoneNumbers: z
    .array(z.object({ Number: text }))
    .nullable()
    .optional(),
})
export const unitSchema = z.object({
  Id: z.uuid(),
  Address1: text,
  Address2: text,
  City: text,
  State: text,
  Zip: text,
  Name: text,
  PropertyId: z.uuid().optional(),
  Status: text,
})
export type Tenant = z.infer<typeof tenantSchema>
export type Unit = z.infer<typeof unitSchema>

const nonBlank = z.string().trim().min(1)
export const validateTenantInputSchema = z
  .object({
    firstName: nonBlank.describe(
      'Tenant first name. Case and repeated whitespace are normalized.',
    ),
    lastName: nonBlank
      .optional()
      .describe(
        'Optional surname. A final surname token can match an initial plus surname.',
      ),
    phoneNumber: nonBlank.describe(
      'Tenant phone number. Must match with the first name before unit/address verification. Matching compares digits exactly, including any country code.',
    ),
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .describe(
        'Optional corroborating tenant email. Matching ignores case; email cannot substitute for a phone match.',
      ),
    address: z
      .object({
        streetAddress: nonBlank.describe(
          'Rented-unit street address. Street suffixes and common unit forms are normalized.',
        ),
        city: nonBlank.describe('Rented-unit city. Must match.'),
        unit: z
          .string()
          .trim()
          .nullable()
          .optional()
          .describe(
            'Apartment or unit identifier, required when the AppFolio street address includes one. Null means omitted.',
          ),
        state: nonBlank
          .optional()
          .describe(
            'Optional state. Reported as a diagnostic; it does not determine acceptance.',
          ),
        postalCode: nonBlank
          .optional()
          .describe(
            'Optional postal code. Reported as a diagnostic; it does not determine acceptance.',
          ),
        rawAddress: z
          .string()
          .trim()
          .optional()
          .describe(
            'Original address for compatibility. Matching uses the structured address fields.',
          ),
      })
      .strict()
      .describe('Structured rented-unit address used for tenant matching.'),
  })
  .strict()

export const matchedRuleSchema = z.enum([
  'first_last_email_phone_address',
  'first_last_phone_address',
  'first_phone_address',
])
export type MatchedRule = z.infer<typeof matchedRuleSchema>
const matchSummarySchema = z
  .object({
    address: z
      .object({
        cityMatched: z.boolean(),
        postalCodeMatched: z.boolean(),
        stateMatched: z.boolean(),
        streetMatched: z.boolean(),
        unitMatched: z.boolean(),
        unitRequired: z.boolean(),
      })
      .strict()
      .optional(),
    matchingPairCount: z.number().int().nonnegative(),
    tenant: z
      .object({
        emailMatched: z.boolean(),
        firstNameMatched: z.boolean(),
        lastNameMatched: z.boolean(),
        phoneMatched: z.boolean(),
      })
      .strict()
      .optional(),
    tenantCandidateCount: z.number().int().nonnegative(),
    unitCandidateCount: z.number().int().nonnegative(),
  })
  .strict()
export type MatchSummary = z.infer<typeof matchSummarySchema>

const failureClassSchema = z.enum([
  'address_mismatch',
  'ambiguous_match',
  'appfolio_unavailable',
  'input_validation',
  'not_current_tenant',
  'tenant_not_found',
  'unit_not_found',
  'missing_occupancy_id',
])
const failureShape = {
  error: z.object({ failureClass: failureClassSchema }).strict(),
  match: matchSummarySchema,
  message: z.string(),
}
const authenticatedResultSchema = z
  .object({
    status: z.literal('authenticated'),
    message: z.string(),
    matchedRule: matchedRuleSchema,
    match: matchSummarySchema.extend({ matchedRule: matchedRuleSchema }),
    tenant: z
      .object({
        firstName: text,
        id: z.uuid(),
        lastName: text,
        occupancyId: z
          .uuid()
          .describe(
            'Validated occupancy identifier required for work-order creation.',
          ),
        primaryTenant: z.boolean().optional(),
        status: z.literal('Current'),
        tenantType: tenantTypeSchema.optional(),
      })
      .strict(),
    unit: z
      .object({
        address: z
          .object({
            city: text,
            display: z.string(),
            postalCode: text,
            state: text,
            streetAddress: text,
            unit: text,
          })
          .strict(),
        id: z.uuid(),
        name: text,
        propertyId: z.uuid().optional(),
        status: text,
      })
      .strict(),
  })
  .strict()

export const validateTenantOutputSchema = z.discriminatedUnion('status', [
  authenticatedResultSchema,
  z
    .object({ ...failureShape, status: z.literal('needs_more_information') })
    .strict(),
  z.object({ ...failureShape, status: z.literal('needs_review') }).strict(),
  z
    .object({ ...failureShape, status: z.literal('not_authenticated') })
    .strict(),
  z
    .object({ ...failureShape, status: z.literal('service_unavailable') })
    .strict(),
])
export type ValidateTenantInput = z.infer<typeof validateTenantInputSchema>
export type ValidateTenantOutput = z.infer<typeof validateTenantOutputSchema>
