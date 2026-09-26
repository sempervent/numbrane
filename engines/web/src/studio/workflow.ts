/**
 * Studio workflow layer (performance score) vs create submodes (Generate/Animate/React).
 */

export type StudioWorkflow = "create" | "set" | "rehearse" | "perform";

export const WORKFLOW_LABELS: Record<StudioWorkflow, string> = {
  create: "Create",
  set: "Set",
  rehearse: "Rehearse",
  perform: "Perform",
};

/** Developer/test affordances (fixture load), not normal product chrome. */
export function studioDevToolsEnabled(): boolean {
  if (typeof location === "undefined") return false;
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  if (meta.env?.DEV) return true;
  return new URLSearchParams(location.search).has("dev");
}
