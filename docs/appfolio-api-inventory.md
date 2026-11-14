# AppFolio API operation inventory

Generated from [database-api-openapi.json](../database-api-openapi.json).
Every listed operation is in version-one scope, including deprecated operations.
This inventory records scope. It does not claim implementation or verification.

Source SHA-256: `525e190240002ac09dbfa33f40202969795a582b12c29f81e20dd95bf2caa918`.

Regenerate with `python3 scripts/generate-appfolio-api-inventory.py`.
Check with `python3 scripts/generate-appfolio-api-inventory.py --check`.

Total: 181 operations across 161 paths.

| Method | Operations |
| ------ | ---------- |
| GET    | 68         |
| POST   | 66         |
| PUT    | 5          |
| PATCH  | 36         |
| DELETE | 6          |

## Operations

Tool names use the contract's operation IDs. Empty request-body entries do not imply that an operation has no parameters.

| Method | Path                                                           | Operation ID and tool name          | Request body          | Deprecated |
| ------ | -------------------------------------------------------------- | ----------------------------------- | --------------------- | ---------- |
| GET    | `/bank_accounts`                                               | `getBankAccounts`                   | None declared         | No         |
| POST   | `/bank_accounts/bulk`                                          | `bulkCreateBankAccounts`            | `application/json`    | No         |
| POST   | `/bank_adjustments/bulk`                                       | `bulkBankAdjustments`               | `application/json`    | No         |
| POST   | `/bank_statements/bulk`                                        | `bulkCreateBankStatements`          | `application/json`    | No         |
| GET    | `/bills`                                                       | `getBills`                          | None declared         | No         |
| POST   | `/bills`                                                       | `createBill`                        | `application/json`    | No         |
| POST   | `/bills/bulk`                                                  | `bulkCreateBill`                    | `application/json`    | Yes        |
| POST   | `/bills/bulk/async`                                            | `bulkCreateBillAsync`               | `application/json`    | No         |
| POST   | `/bills/{BillId}/attachments`                                  | `createBillAttachment`              | `multipart/form-data` | No         |
| PATCH  | `/bills/{billId}`                                              | `updateBill`                        | `application/json`    | No         |
| GET    | `/ca/associations`                                             | `getCommunityAssociations`          | None declared         | No         |
| GET    | `/ca/bank_balances`                                            | `getCaBankBalances`                 | None declared         | No         |
| GET    | `/ca/board_members`                                            | `getCaBoardMembers`                 | None declared         | No         |
| GET    | `/ca/homeowner_ledgers`                                        | `getCaHomeownerLedgers`             | None declared         | No         |
| GET    | `/ca/homeowners`                                               | `getCaHomeowners`                   | None declared         | No         |
| GET    | `/ca/renters`                                                  | `getCaRenters`                      | None declared         | No         |
| GET    | `/ca/rules`                                                    | `getCaRules`                        | None declared         | No         |
| GET    | `/ca/units`                                                    | `getCaUnits`                        | None declared         | No         |
| GET    | `/ca/violations`                                               | `getCaViolations`                   | None declared         | No         |
| POST   | `/ca/violations`                                               | `createCaViolation`                 | `application/json`    | No         |
| PATCH  | `/ca/violations/{violationId}`                                 | `updateCaViolation`                 | `application/json`    | No         |
| POST   | `/ca/violations/{violationId}/attachments`                     | `createCaViolationAttachment`       | `multipart/form-data` | No         |
| GET    | `/charges`                                                     | `getCharges`                        | None declared         | No         |
| POST   | `/charges`                                                     | `createCharge`                      | `application/json`    | No         |
| POST   | `/charges/bulk`                                                | `bulkCreateCharge`                  | `application/json`    | Yes        |
| POST   | `/charges/bulk/async`                                          | `bulkCreateChargeAsync`             | `application/json`    | No         |
| POST   | `/charges/{ChargeId}/attachments`                              | `createChargeAttachment`            | `multipart/form-data` | No         |
| POST   | `/corporate/gl_accounts/bulk`                                  | `bulkCreateCorporateGlAccounts`     | `application/json`    | No         |
| GET    | `/corporate_entities`                                          | `getCorporateEntities`              | None declared         | No         |
| GET    | `/corporate_entities/attachments`                              | `listCorporateEntityAttachments`    | None declared         | No         |
| POST   | `/corporate_entities/{CorporateEntityId}/attachments`          | `createCorporateEntityAttachment`   | `multipart/form-data` | No         |
| GET    | `/custom_fields`                                               | `getCustomFields`                   | None declared         | No         |
| GET    | `/delinquent_charges`                                          | `getDelinquentCharges`              | None declared         | No         |
| GET    | `/folders`                                                     | `getfolders`                        | None declared         | No         |
| POST   | `/folders/bulk`                                                | `bulkCreateFolders`                 | `application/json`    | No         |
| GET    | `/gl_accounts`                                                 | `getGlAccounts`                     | None declared         | No         |
| POST   | `/gl_accounts/bulk`                                            | `bulkCreateGlAccounts`              | `application/json`    | No         |
| GET    | `/gl_details`                                                  | `getGlDetail`                       | None declared         | No         |
| POST   | `/import_uids/bulk`                                            | `bulkCreateImportUids`              | `application/json`    | No         |
| POST   | `/inspections`                                                 | `createInspection`                  | `application/json`    | No         |
| POST   | `/inspections/bulk`                                            | `bulkCreateInspections`             | `application/json`    | No         |
| PATCH  | `/inspections/{InspectionId}`                                  | `updateInspection`                  | `application/json`    | No         |
| DELETE | `/inspections/{InspectionId}`                                  | `deleteInspection`                  | None declared         | No         |
| POST   | `/inspections/{InspectionId}/attachments`                      | `createInspectionAttachment`        | `multipart/form-data` | No         |
| GET    | `/inventories`                                                 | `getInventories`                    | None declared         | No         |
| POST   | `/inventories`                                                 | `createInventory`                   | `application/json`    | No         |
| POST   | `/inventories/bulk`                                            | `bulkCreateInventories`             | `application/json`    | No         |
| PATCH  | `/inventories/{Id}`                                            | `updateInventory`                   | `application/json`    | No         |
| DELETE | `/inventories/{Id}`                                            | `deleteInventory`                   | None declared         | No         |
| GET    | `/inventory_locations`                                         | `getInventoryLocations`             | None declared         | No         |
| POST   | `/inventory_locations`                                         | `createInventoryLocation`           | `application/json`    | No         |
| POST   | `/inventory_locations/bulk`                                    | `bulkCreateInventoryLocations`      | `application/json`    | No         |
| PATCH  | `/inventory_locations/{Id}`                                    | `updateInventoryLocation`           | `application/json`    | No         |
| GET    | `/jobs`                                                        | `getjobs`                           | None declared         | No         |
| GET    | `/journal_entries`                                             | `getJournalEntries`                 | None declared         | No         |
| POST   | `/journal_entries`                                             | `createJournalEntry`                | `application/json`    | No         |
| POST   | `/journal_entries/bulk`                                        | `bulkCreateJournalEntries`          | `application/json`    | No         |
| PATCH  | `/journal_entries/{JournalEntryId}`                            | `updateJournalEntry`                | `application/json`    | No         |
| POST   | `/journal_entries/{JournalEntryId}/attachments`                | `createJournalEntryAttachment`      | `multipart/form-data` | No         |
| GET    | `/late_fee_policies`                                           | `getLateFeePolicies`                | None declared         | No         |
| POST   | `/late_fee_policies/bulk`                                      | `bulkCreateLateFeePolicies`         | `application/json`    | No         |
| GET    | `/leads`                                                       | `getLeads`                          | None declared         | No         |
| POST   | `/leads`                                                       | `createLead`                        | `application/json`    | No         |
| GET    | `/leads/notes`                                                 | `getLeadsNotes`                     | None declared         | No         |
| POST   | `/leads/{GuestCardId}/notes`                                   | `createLeadNote`                    | `application/json`    | No         |
| PATCH  | `/leads/{GuestCardId}/notes/{Id}`                              | `updateLeadNote`                    | `application/json`    | No         |
| PATCH  | `/leads/{leadId}`                                              | `updateLead`                        | `application/json`    | No         |
| GET    | `/leases`                                                      | `getLeases`                         | None declared         | No         |
| GET    | `/leases/renewal_pricings`                                     | `getLeaseRenewalPricings`           | None declared         | No         |
| PUT    | `/leases/renewal_pricings/bulk`                                | `putBulkLeaseRenewalPricings`       | `application/json`    | No         |
| PATCH  | `/leases/{LeaseId}`                                            | `updateLease`                       | `application/json`    | No         |
| GET    | `/listings`                                                    | `getListings`                       | None declared         | No         |
| GET    | `/mailing_letters`                                             | `getMailingLetters`                 | None declared         | No         |
| PATCH  | `/mailing_letters/bulk_update`                                 | `bulkUpdateMailingLetter`           | `application/json`    | No         |
| PATCH  | `/mailing_letters/{mailingLetterId}`                           | `updateMailingLetter`               | `application/json`    | No         |
| GET    | `/occupancies/attachments`                                     | `listOccupancyAttachments`          | None declared         | No         |
| GET    | `/occupancies/documents`                                       | `getOccupancyDocuments`             | None declared         | No         |
| POST   | `/occupancies/{OccupancyId}/attachments`                       | `createOccupancyAttachment`         | `multipart/form-data` | No         |
| GET    | `/owner_groups`                                                | `getOwnerGroups`                    | None declared         | No         |
| POST   | `/owner_groups`                                                | `createOwnerGroup`                  | `application/json`    | No         |
| PATCH  | `/owner_groups/{id}`                                           | `updateOwnerGroup`                  | `application/json`    | No         |
| GET    | `/owners`                                                      | `getOwners`                         | None declared         | No         |
| POST   | `/owners`                                                      | `createOwner`                       | `application/json`    | No         |
| GET    | `/owners/attachments`                                          | `listOwnerAttachments`              | None declared         | No         |
| POST   | `/owners/bulk`                                                 | `bulkCreateOwners`                  | `application/json`    | No         |
| GET    | `/owners/notes`                                                | `getOwnersNotes`                    | None declared         | No         |
| POST   | `/owners/{OwnerId}/attachments`                                | `createOwnerAttachment`             | `multipart/form-data` | No         |
| POST   | `/owners/{OwnerId}/notes`                                      | `createOwnerNote`                   | `application/json`    | No         |
| PATCH  | `/owners/{OwnerId}/notes/{Id}`                                 | `updateOwnerNote`                   | `application/json`    | No         |
| GET    | `/owners/{ownerId}`                                            | `getOwner`                          | None declared         | No         |
| PATCH  | `/owners/{ownerId}`                                            | `updateOwner`                       | `application/json`    | No         |
| GET    | `/payables`                                                    | `getPayables`                       | None declared         | No         |
| GET    | `/portfolios`                                                  | `getPortfolios`                     | None declared         | No         |
| PATCH  | `/portfolios/{portfolioId}`                                    | `updatePortfolio`                   | `application/json`    | No         |
| POST   | `/prepayments/bulk`                                            | `bulkCreatePrepayments`             | `application/json`    | No         |
| POST   | `/prepayments/{Id}/reverse`                                    | `reversePrepayment`                 | None declared         | No         |
| GET    | `/properties`                                                  | `getProperties`                     | None declared         | No         |
| PUT    | `/properties/amenity_pricings/bulk`                            | `bulkUpdateAmenityPricings`         | `application/json`    | No         |
| GET    | `/properties/attachments`                                      | `listPropertyAttachments`           | None declared         | No         |
| POST   | `/properties/bulk`                                             | `bulkCreateProperties`              | `application/json`    | No         |
| GET    | `/properties/marketing_photos`                                 | `getPropertiesMarketingPhotos`      | None declared         | No         |
| GET    | `/properties/notes`                                            | `getPropertiesNotes`                | None declared         | No         |
| GET    | `/properties/photos`                                           | `getPropertiesPhotos`               | None declared         | No         |
| POST   | `/properties/{PropertyId}/attachments`                         | `createPropertyAttachment`          | `multipart/form-data` | No         |
| POST   | `/properties/{PropertyId}/marketing_photos`                    | `createPropertyMarketingPhoto`      | `multipart/form-data` | No         |
| PATCH  | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `updatePropertyMarketingPhoto`      | `application/json`    | No         |
| DELETE | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `deletePropertyMarketingPhoto`      | None declared         | No         |
| POST   | `/properties/{PropertyId}/notes`                               | `createpropertyNote`                | `application/json`    | No         |
| PATCH  | `/properties/{PropertyId}/notes/{Id}`                          | `updatepropertyNote`                | `application/json`    | No         |
| POST   | `/properties/{PropertyId}/photos`                              | `createPropertyPhoto`               | `multipart/form-data` | No         |
| PATCH  | `/properties/{PropertyId}/photos/{PhotoId}`                    | `updatepropertyPhoto`               | `application/json`    | No         |
| DELETE | `/properties/{PropertyId}/photos/{PhotoId}`                    | `deletePropertyPhoto`               | None declared         | No         |
| PATCH  | `/properties/{propertyId}`                                     | `updateProperty`                    | `application/json`    | No         |
| GET    | `/property_groups`                                             | `getPropertyGroups`                 | None declared         | No         |
| PATCH  | `/property_groups/{propertyGroupId}`                           | `updatePropertyGroup`               | `application/json`    | No         |
| GET    | `/purchase_orders`                                             | `getPurchaseOrders`                 | None declared         | No         |
| GET    | `/recurring_charges`                                           | `getRecurringCharges`               | None declared         | No         |
| POST   | `/recurring_charges`                                           | `createRecurringCharges`            | `application/json`    | No         |
| POST   | `/recurring_charges/bulk`                                      | `bulkCreateRecurringCharges`        | `application/json`    | No         |
| PATCH  | `/recurring_charges/{recurringChargeId}`                       | `updateRecurringCharge`             | `application/json`    | No         |
| GET    | `/recurring_journal_entries`                                   | `getRecurringJournalEntries`        | None declared         | No         |
| POST   | `/recurring_journal_entries/bulk`                              | `bulkCreateRecurringJournalEntries` | `application/json`    | No         |
| GET    | `/rental_applications`                                         | `getRentalApplications`             | None declared         | No         |
| GET    | `/rental_applications/notes`                                   | `getRentalApplicationsNotes`        | None declared         | No         |
| POST   | `/rental_applications/{RentalApplicationId}/attachments`       | `createRentalApplicationAttachment` | `multipart/form-data` | No         |
| POST   | `/rental_applications/{RentalApplicationId}/notes`             | `createRentalApplicationNote`       | `application/json`    | No         |
| PATCH  | `/rental_applications/{RentalApplicationId}/notes/{Id}`        | `updateRentalApplicationNote`       | `application/json`    | No         |
| PATCH  | `/rental_applications/{rentalApplicationId}`                   | `updateRentalApplication`           | `application/json`    | No         |
| POST   | `/security_deposits/bulk`                                      | `bulkCreateSecurityDeposits`        | `application/json`    | No         |
| POST   | `/security_deposits/{SecurityDepositId}/reverse`               | `reverseSecurityDeposit`            | None declared         | No         |
| GET    | `/showings`                                                    | `getShowings`                       | None declared         | No         |
| POST   | `/showings`                                                    | `createShowing`                     | `application/json`    | No         |
| PATCH  | `/showings/{showingId}`                                        | `updateShowing`                     | `application/json`    | No         |
| GET    | `/tenant_ledgers`                                              | `getTenantLedgers`                  | None declared         | No         |
| GET    | `/tenants`                                                     | `getTenants`                        | None declared         | No         |
| PATCH  | `/tenants/bulk`                                                | `bulkUpdateTenants`                 | `application/json`    | No         |
| GET    | `/tenants/notes`                                               | `getTenantsNotes`                   | None declared         | No         |
| POST   | `/tenants/{TenantId}/notes`                                    | `createTenantNote`                  | `application/json`    | No         |
| PATCH  | `/tenants/{TenantId}/notes/{Id}`                               | `updateTenantNote`                  | `application/json`    | No         |
| PATCH  | `/tenants/{tenantId}`                                          | `updateTenant`                      | `application/json`    | No         |
| GET    | `/transferred_attachments`                                     | `listTransferableAttachments`       | None declared         | No         |
| POST   | `/transferred_attachments/bulk`                                | `bulkCreateTransferredAttachments`  | `application/json`    | No         |
| POST   | `/transferred_photos/bulk`                                     | `bulkCreateTransferredPhotos`       | `application/json`    | No         |
| GET    | `/unit_types`                                                  | `getUnitTypes`                      | None declared         | No         |
| POST   | `/unit_types/bulk`                                             | `bulkCreateUnitTypes`               | `application/json`    | No         |
| GET    | `/unit_types/marketing_photos`                                 | `getUnitTypesMarketingPhotos`       | None declared         | No         |
| GET    | `/unit_types/photos`                                           | `getUnitTypesPhotos`                | None declared         | No         |
| PATCH  | `/unit_types/{unitTypeId}`                                     | `updateUnitType`                    | `application/json`    | No         |
| GET    | `/units`                                                       | `getUnits`                          | None declared         | No         |
| GET    | `/units/attachments`                                           | `listUnitAttachments`               | None declared         | No         |
| POST   | `/units/bulk`                                                  | `bulkCreateUnits`                   | `application/json`    | No         |
| PATCH  | `/units/bulk`                                                  | `bulkUpdateUnits`                   | `application/json`    | No         |
| GET    | `/units/notes`                                                 | `getUnitsNotes`                     | None declared         | No         |
| GET    | `/units/photos`                                                | `getUnitsPhotos`                    | None declared         | No         |
| PUT    | `/units/pricing_matrices/bulk`                                 | `putBulkUnitPricingMatrix`          | `application/json`    | Yes        |
| PUT    | `/units/pricing_matrices/bulk/async`                           | `putBulkUnitPricingMatrixAsync`     | `application/json`    | No         |
| POST   | `/units/{UnitId}/attachments`                                  | `createUnitAttachment`              | `multipart/form-data` | No         |
| POST   | `/units/{UnitId}/notes`                                        | `createUnitNote`                    | `application/json`    | No         |
| PATCH  | `/units/{UnitId}/notes/{Id}`                                   | `updateUnitNote`                    | `application/json`    | No         |
| POST   | `/units/{UnitId}/photos`                                       | `createUnitPhoto`                   | `multipart/form-data` | No         |
| PATCH  | `/units/{UnitId}/photos/{PhotoId}`                             | `updateUnitPhoto`                   | `application/json`    | No         |
| DELETE | `/units/{UnitId}/photos/{PhotoId}`                             | `deleteUnitPhoto`                   | None declared         | No         |
| PUT    | `/units/{UnitId}/pricing_matrices`                             | `putUnitPricingMatrix`              | `application/json`    | No         |
| PATCH  | `/units/{unitId}`                                              | `updateUnit`                        | `application/json`    | No         |
| GET    | `/users`                                                       | `getUsers`                          | None declared         | No         |
| GET    | `/vendors`                                                     | `getVendors`                        | None declared         | No         |
| POST   | `/vendors`                                                     | `createVendor`                      | `application/json`    | No         |
| POST   | `/vendors/bulk`                                                | `bulkCreateVendors`                 | `application/json`    | No         |
| GET    | `/vendors/notes`                                               | `getVendorsNotes`                   | None declared         | No         |
| POST   | `/vendors/{VendorId}/notes`                                    | `createVendorNote`                  | `application/json`    | No         |
| PATCH  | `/vendors/{VendorId}/notes/{Id}`                               | `updateVendorNote`                  | `application/json`    | No         |
| PATCH  | `/vendors/{vendorId}`                                          | `updateVendor`                      | `application/json`    | No         |
| GET    | `/work_orders`                                                 | `getWorkOrders`                     | None declared         | No         |
| POST   | `/work_orders`                                                 | `createWorkOrder`                   | `application/json`    | No         |
| GET    | `/work_orders/attachments`                                     | `listWorkOrderAttachments`          | None declared         | No         |
| GET    | `/work_orders/notes`                                           | `getWorkOrdersNotes`                | None declared         | No         |
| POST   | `/work_orders/{WorkOrderId}/attachments`                       | `createWorkOrderAttachment`         | `multipart/form-data` | No         |
| DELETE | `/work_orders/{WorkOrderId}/attachments/{AttachmentId}`        | `deleteWorkOrderAttachment`         | None declared         | No         |
| POST   | `/work_orders/{WorkOrderId}/notes`                             | `createWorkOrderNote`               | `application/json`    | No         |
| PATCH  | `/work_orders/{WorkOrderId}/notes/{Id}`                        | `updateWorkOrderNote`               | `application/json`    | No         |
| PATCH  | `/work_orders/{workOrderId}`                                   | `updateWorkOrder`                   | `application/json`    | No         |
