# Operation coverage mapping

Generated from the unchanged OpenAPI contract. All rows map to the same named tool in
`src/appfolio/catalog.json`, with operation-specific input and HTTP response schemas.
`contract.test.ts` constructs every request; `lifecycle.test.ts` executes success/error
fixtures through grant binding, authentication, serialization and response validation.
Live evidence is separate in `verification.md`. This table does not claim live coverage.

| Tool | Method | Path | Response statuses |
| --- | --- | --- | --- |
| `getBankAccounts` | GET | `/bank_accounts` | 200, 403, 401, 500, 503 |
| `bulkCreateBankAccounts` | POST | `/bank_accounts/bulk` | 201, 422, 403, 401, 500, 503, 533, 400, 409 |
| `bulkBankAdjustments` | POST | `/bank_adjustments/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `bulkCreateBankStatements` | POST | `/bank_statements/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `getBills` | GET | `/bills` | 200, 403, 401, 500, 503, 533 |
| `createBill` | POST | `/bills` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateBill` | PATCH | `/bills/{billId}` | 200, 403, 401, 500, 503, 533, 400, 409, 422 |
| `createBillAttachment` | POST | `/bills/{BillId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `bulkCreateBill` | POST | `/bills/bulk` | 202, 403, 401, 500, 503, 533, 400, 409, 422 |
| `bulkCreateBillAsync` | POST | `/bills/bulk/async` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `getCaBankBalances` | GET | `/ca/bank_balances` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaBoardMembers` | GET | `/ca/board_members` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaHomeowners` | GET | `/ca/homeowners` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaHomeownerLedgers` | GET | `/ca/homeowner_ledgers` | 200, 403, 500, 503, 533 |
| `getCaRenters` | GET | `/ca/renters` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaRules` | GET | `/ca/rules` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaUnits` | GET | `/ca/units` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCaViolations` | GET | `/ca/violations` | 400, 403, 422, 500, 503, 533, 200 |
| `createCaViolation` | POST | `/ca/violations` | 201, 422, 403, 500, 503, 533, 400, 409 |
| `createCaViolationAttachment` | POST | `/ca/violations/{violationId}/attachments` | 201, 403, 500, 503, 533, 400, 409, 422 |
| `updateCaViolation` | PATCH | `/ca/violations/{violationId}` | 200, 403, 422, 500, 503, 533, 400, 409 |
| `getCharges` | GET | `/charges` | 204, 403, 401, 500, 503 |
| `createCharge` | POST | `/charges` | 201, 422, 403, 401, 500, 503, 533, 400, 409 |
| `bulkCreateCharge` | POST | `/charges/bulk` | 202, 403, 401, 500, 503, 533, 400, 409, 422 |
| `bulkCreateChargeAsync` | POST | `/charges/bulk/async` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `createChargeAttachment` | POST | `/charges/{ChargeId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getCommunityAssociations` | GET | `/ca/associations` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getCorporateEntities` | GET | `/corporate_entities` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createCorporateEntityAttachment` | POST | `/corporate_entities/{CorporateEntityId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `listCorporateEntityAttachments` | GET | `/corporate_entities/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateCorporateGlAccounts` | POST | `/corporate/gl_accounts/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `getCustomFields` | GET | `/custom_fields` | 400, 403, 401, 500, 503, 533, 200 |
| `getDelinquentCharges` | GET | `/delinquent_charges` | 200, 403, 401, 500, 503 |
| `getfolders` | GET | `/folders` | 200, 403, 401, 500, 503 |
| `bulkCreateFolders` | POST | `/folders/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `getGlAccounts` | GET | `/gl_accounts` | 200, 403, 401, 500, 503, 533 |
| `bulkCreateGlAccounts` | POST | `/gl_accounts/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `getGlDetail` | GET | `/gl_details` | 200, 403, 401, 500, 503, 533 |
| `bulkCreateImportUids` | POST | `/import_uids/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `createInspectionAttachment` | POST | `/inspections/{InspectionId}/attachments` | 201, 404, 403, 401, 500, 503, 533, 400, 409, 422 |
| `createInspection` | POST | `/inspections` | 201, 422, 400, 403, 401, 500, 503, 533, 409 |
| `bulkCreateInspections` | POST | `/inspections/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `updateInspection` | PATCH | `/inspections/{InspectionId}` | 200, 404, 422, 400, 403, 401, 500, 503, 533, 409 |
| `deleteInspection` | DELETE | `/inspections/{InspectionId}` | 204, 404, 403, 401, 500, 503, 533 |
| `createInventory` | POST | `/inventories` | 201, 422, 400, 403, 401, 500, 503, 533, 409 |
| `getInventories` | GET | `/inventories` | 200, 403, 401, 500, 503, 533 |
| `bulkCreateInventories` | POST | `/inventories/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `updateInventory` | PATCH | `/inventories/{Id}` | 403, 401, 500, 503, 200, 404, 422, 400, 409 |
| `deleteInventory` | DELETE | `/inventories/{Id}` | 204, 404, 422, 403, 401, 500, 503, 533 |
| `getInventoryLocations` | GET | `/inventory_locations` | 200, 403, 401, 500, 503, 533 |
| `createInventoryLocation` | POST | `/inventory_locations` | 201, 422, 403, 401, 500, 503, 533, 400, 409 |
| `bulkCreateInventoryLocations` | POST | `/inventory_locations/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `updateInventoryLocation` | PATCH | `/inventory_locations/{Id}` | 403, 401, 500, 503, 200, 404, 422, 400, 409 |
| `getjobs` | GET | `/jobs` | 200, 403, 401, 500, 503 |
| `getJournalEntries` | GET | `/journal_entries` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createJournalEntry` | POST | `/journal_entries` | 201, 400, 403, 401, 500, 503, 533, 409, 422 |
| `updateJournalEntry` | PATCH | `/journal_entries/{JournalEntryId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `bulkCreateJournalEntries` | POST | `/journal_entries/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `createJournalEntryAttachment` | POST | `/journal_entries/{JournalEntryId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getLateFeePolicies` | GET | `/late_fee_policies` | 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateLateFeePolicies` | POST | `/late_fee_policies/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `getLeads` | GET | `/leads` | 403, 401, 422, 500, 503, 533, 200 |
| `createLead` | POST | `/leads` | 400, 403, 401, 500, 503, 533, 201, 422, 409 |
| `updateLead` | PATCH | `/leads/{leadId}` | 403, 401, 500, 503, 533, 200, 404, 422, 400, 409 |
| `getLeadsNotes` | GET | `/leads/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createLeadNote` | POST | `/leads/{GuestCardId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateLeadNote` | PATCH | `/leads/{GuestCardId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `getLeases` | GET | `/leases` | 200, 403, 401, 500, 503 |
| `updateLease` | PATCH | `/leases/{LeaseId}` | 403, 401, 500, 503, 200, 404, 422, 400, 409 |
| `getLeaseRenewalPricings` | GET | `/leases/renewal_pricings` | 200, 403, 401, 500, 503, 533 |
| `putBulkLeaseRenewalPricings` | PUT | `/leases/renewal_pricings/bulk` | 202, 400, 401, 403, 500, 503, 409, 422 |
| `getListings` | GET | `/listings` | 200, 400, 403, 401, 500, 503, 533 |
| `getMailingLetters` | GET | `/mailing_letters` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `updateMailingLetter` | PATCH | `/mailing_letters/{mailingLetterId}` | 400, 403, 401, 422, 500, 503, 533, 200, 409 |
| `bulkUpdateMailingLetter` | PATCH | `/mailing_letters/bulk_update` | 200, 422, 403, 401, 500, 503, 533, 400, 409 |
| `createOccupancyAttachment` | POST | `/occupancies/{OccupancyId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `listOccupancyAttachments` | GET | `/occupancies/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getOccupancyDocuments` | GET | `/occupancies/documents` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getOwners` | GET | `/owners` | 200, 400, 403, 401, 422, 500, 503, 533 |
| `createOwner` | POST | `/owners` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getOwner` | GET | `/owners/{ownerId}` | 200, 400, 403, 401, 404, 500, 503, 533 |
| `updateOwner` | PATCH | `/owners/{ownerId}` | 200, 403, 401, 500, 503, 533, 400, 409, 422 |
| `bulkCreateOwners` | POST | `/owners/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `createOwnerAttachment` | POST | `/owners/{OwnerId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `listOwnerAttachments` | GET | `/owners/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getOwnersNotes` | GET | `/owners/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createOwnerNote` | POST | `/owners/{OwnerId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateOwnerNote` | PATCH | `/owners/{OwnerId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `getOwnerGroups` | GET | `/owner_groups` | 400, 403, 401, 422, 200, 500, 503, 533 |
| `createOwnerGroup` | POST | `/owner_groups` | 201, 422, 403, 401, 500, 503, 533, 400, 409 |
| `updateOwnerGroup` | PATCH | `/owner_groups/{id}` | 200, 404, 422, 403, 401, 500, 503, 533, 400, 409 |
| `getPayables` | GET | `/payables` | 200, 403, 401, 500, 503, 533 |
| `bulkCreatePrepayments` | POST | `/prepayments/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `reversePrepayment` | POST | `/prepayments/{Id}/reverse` | 204, 404, 422, 403, 500, 503, 533, 400, 409 |
| `getPortfolios` | GET | `/portfolios` | 400, 403, 401, 500, 503, 533, 200 |
| `updatePortfolio` | PATCH | `/portfolios/{portfolioId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `getProperties` | GET | `/properties` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateProperties` | POST | `/properties/bulk` | 201, 422, 403, 500, 503, 533, 400, 409 |
| `bulkUpdateAmenityPricings` | PUT | `/properties/amenity_pricings/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `updateProperty` | PATCH | `/properties/{propertyId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `listPropertyAttachments` | GET | `/properties/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createPropertyAttachment` | POST | `/properties/{PropertyId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getPropertiesNotes` | GET | `/properties/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createpropertyNote` | POST | `/properties/{PropertyId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updatepropertyNote` | PATCH | `/properties/{PropertyId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `getPropertiesMarketingPhotos` | GET | `/properties/marketing_photos` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `updatePropertyMarketingPhoto` | PATCH | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `deletePropertyMarketingPhoto` | DELETE | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | 204, 403, 404, 401, 500, 503, 533 |
| `getPropertiesPhotos` | GET | `/properties/photos` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createPropertyMarketingPhoto` | POST | `/properties/{PropertyId}/marketing_photos` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `createPropertyPhoto` | POST | `/properties/{PropertyId}/photos` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updatepropertyPhoto` | PATCH | `/properties/{PropertyId}/photos/{PhotoId}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `deletePropertyPhoto` | DELETE | `/properties/{PropertyId}/photos/{PhotoId}` | 204, 403, 404, 401, 500, 503, 533 |
| `getPropertyGroups` | GET | `/property_groups` | 400, 403, 401, 500, 503, 533, 200 |
| `updatePropertyGroup` | PATCH | `/property_groups/{propertyGroupId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `getPurchaseOrders` | GET | `/purchase_orders` | 200, 403, 401, 500, 503, 533 |
| `getRecurringCharges` | GET | `/recurring_charges` | 400, 403, 401, 500, 503, 533, 200 |
| `createRecurringCharges` | POST | `/recurring_charges` | 400, 403, 401, 500, 503, 533, 201, 409, 422 |
| `bulkCreateRecurringCharges` | POST | `/recurring_charges/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `updateRecurringCharge` | PATCH | `/recurring_charges/{recurringChargeId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `getRecurringJournalEntries` | GET | `/recurring_journal_entries` | 400, 403, 401, 500, 503, 533, 200 |
| `bulkCreateRecurringJournalEntries` | POST | `/recurring_journal_entries/bulk` | 202, 400, 403, 401, 500, 503, 533, 409, 422 |
| `createRentalApplicationAttachment` | POST | `/rental_applications/{RentalApplicationId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getRentalApplications` | GET | `/rental_applications` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `updateRentalApplication` | PATCH | `/rental_applications/{rentalApplicationId}` | 500, 503, 533, 200, 403, 404, 422, 400, 409 |
| `getRentalApplicationsNotes` | GET | `/rental_applications/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createRentalApplicationNote` | POST | `/rental_applications/{RentalApplicationId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateRentalApplicationNote` | PATCH | `/rental_applications/{RentalApplicationId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `bulkCreateSecurityDeposits` | POST | `/security_deposits/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `reverseSecurityDeposit` | POST | `/security_deposits/{SecurityDepositId}/reverse` | 204, 403, 401, 500, 503, 533, 400, 409, 422 |
| `getShowings` | GET | `/showings` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createShowing` | POST | `/showings` | 403, 401, 500, 503, 533, 201, 400, 409, 422 |
| `updateShowing` | PATCH | `/showings/{showingId}` | 500, 503, 533, 200, 403, 404, 422, 400, 409 |
| `getTenants` | GET | `/tenants` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `updateTenant` | PATCH | `/tenants/{tenantId}` | 200, 422, 400, 403, 401, 500, 503, 533, 409 |
| `getTenantsNotes` | GET | `/tenants/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createTenantNote` | POST | `/tenants/{TenantId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateTenantNote` | PATCH | `/tenants/{TenantId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `bulkUpdateTenants` | PATCH | `/tenants/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `getTenantLedgers` | GET | `/tenant_ledgers` | 200, 403, 500, 503, 533 |
| `listTransferableAttachments` | GET | `/transferred_attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateTransferredAttachments` | POST | `/transferred_attachments/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `bulkCreateTransferredPhotos` | POST | `/transferred_photos/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `getUnits` | GET | `/units` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateUnits` | POST | `/units/bulk` | 201, 422, 403, 500, 503, 533, 400, 409 |
| `bulkUpdateUnits` | PATCH | `/units/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `putBulkUnitPricingMatrix` | PUT | `/units/pricing_matrices/bulk` | 200, 422, 403, 401, 500, 503, 533, 400, 409 |
| `putBulkUnitPricingMatrixAsync` | PUT | `/units/pricing_matrices/bulk/async` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `updateUnit` | PATCH | `/units/{unitId}` | 403, 401, 422, 500, 503, 533, 201, 404, 400, 409 |
| `putUnitPricingMatrix` | PUT | `/units/{UnitId}/pricing_matrices` | 200, 403, 401, 500, 503, 533, 400, 409, 422 |
| `createUnitAttachment` | POST | `/units/{UnitId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `listUnitAttachments` | GET | `/units/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getUnitsNotes` | GET | `/units/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createUnitNote` | POST | `/units/{UnitId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateUnitNote` | PATCH | `/units/{UnitId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `createUnitPhoto` | POST | `/units/{UnitId}/photos` | 201, 403, 401, 422, 500, 503, 533, 400, 409 |
| `updateUnitPhoto` | PATCH | `/units/{UnitId}/photos/{PhotoId}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `deleteUnitPhoto` | DELETE | `/units/{UnitId}/photos/{PhotoId}` | 204, 403, 404, 401, 500, 503, 533 |
| `getUnitsPhotos` | GET | `/units/photos` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getUnitTypes` | GET | `/unit_types` | 403, 401, 422, 500, 503, 533, 200 |
| `getUnitTypesPhotos` | GET | `/unit_types/photos` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `getUnitTypesMarketingPhotos` | GET | `/unit_types/marketing_photos` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `bulkCreateUnitTypes` | POST | `/unit_types/bulk` | 202, 422, 403, 500, 503, 533, 400, 409 |
| `updateUnitType` | PATCH | `/unit_types/{unitTypeId}` | 500, 503, 533, 200, 403, 404, 422, 400, 409 |
| `getUsers` | GET | `/users` | 400, 403, 401, 500, 503, 533, 200, 422 |
| `getVendors` | GET | `/vendors` | 400, 403, 401, 422, 500, 503, 533, 200, 404 |
| `createVendor` | POST | `/vendors` | 201, 422, 403, 401, 500, 503, 533, 400, 409 |
| `updateVendor` | PATCH | `/vendors/{vendorId}` | 200, 422, 403, 401, 500, 503, 533, 400, 409 |
| `bulkCreateVendors` | POST | `/vendors/bulk` | 202, 422, 403, 401, 500, 503, 533, 400, 409 |
| `getVendorsNotes` | GET | `/vendors/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createVendorNote` | POST | `/vendors/{VendorId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateVendorNote` | PATCH | `/vendors/{VendorId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `getWorkOrders` | GET | `/work_orders` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createWorkOrder` | POST | `/work_orders` | 201, 403, 404, 422, 500, 503, 533, 400, 409 |
| `listWorkOrderAttachments` | GET | `/work_orders/attachments` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `updateWorkOrder` | PATCH | `/work_orders/{workOrderId}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
| `createWorkOrderAttachment` | POST | `/work_orders/{WorkOrderId}/attachments` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `deleteWorkOrderAttachment` | DELETE | `/work_orders/{WorkOrderId}/attachments/{AttachmentId}` | 204, 403, 404, 401, 500, 503, 533 |
| `getWorkOrdersNotes` | GET | `/work_orders/notes` | 400, 403, 401, 422, 500, 503, 533, 200 |
| `createWorkOrderNote` | POST | `/work_orders/{WorkOrderId}/notes` | 201, 403, 401, 500, 503, 533, 400, 409, 422 |
| `updateWorkOrderNote` | PATCH | `/work_orders/{WorkOrderId}/notes/{Id}` | 200, 403, 404, 422, 500, 503, 533, 400, 409 |
