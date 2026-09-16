export type CatalogAuditReport = {
  catalogEntries: number;
  runtimeDescriptors: number;
  intersection: number;
  missingRuntime: string[];
  orphanRuntime: string[];
  capabilityMismatches: Array<{ pieceId: string; reason: string }>;
  nonAnimateCatalog: string[];
  nonGenerateCatalog: string[];
};
