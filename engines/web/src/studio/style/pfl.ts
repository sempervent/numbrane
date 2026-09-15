/**
 * PFL visual styles — curated art direction for Studio exploration.
 */

export type PflStyleId =
  | "pfl-signal"
  | "pfl-ritual"
  | "pfl-organism"
  | "pfl-machine"
  | "pfl-void"
  | "pfl-afterimage";

export type PflStyle = {
  id: PflStyleId;
  label: string;
  parameters: Record<string, number | string | boolean>;
};

export const PFL_STYLES: PflStyle[] = [
  {
    id: "pfl-signal",
    label: "PFL / Signal",
    parameters: {
      palette: "electric-cyan",
      paper_style: "dark",
      background: "near-black",
      ink: 1.35,
      margin: 1.22,
      density: 0.85,
      pfl_style: "pfl-signal",
    },
  },
  {
    id: "pfl-ritual",
    label: "PFL / Ritual",
    parameters: {
      palette: "bone-black",
      paper_style: "warm-paper",
      background: "warm-paper",
      ink: 1.2,
      margin: 1.28,
      density: 0.65,
      pfl_style: "pfl-ritual",
    },
  },
  {
    id: "pfl-organism",
    label: "PFL / Organism",
    parameters: {
      palette: "muted-mineral",
      paper_style: "dark",
      background: "near-black",
      ink: 1.25,
      margin: 1.15,
      density: 0.95,
      pfl_style: "pfl-organism",
    },
  },
  {
    id: "pfl-machine",
    label: "PFL / Machine",
    parameters: {
      palette: "cold-technical",
      paper_style: "dark",
      background: "pure-black",
      ink: 1.45,
      margin: 1.12,
      density: 1.05,
      pfl_style: "pfl-machine",
    },
  },
  {
    id: "pfl-void",
    label: "PFL / Void",
    parameters: {
      palette: "monochrome-ink",
      paper_style: "dark",
      background: "pure-black",
      ink: 1.5,
      margin: 1.35,
      density: 0.55,
      pfl_style: "pfl-void",
    },
  },
  {
    id: "pfl-afterimage",
    label: "PFL / Afterimage",
    parameters: {
      palette: "ember",
      paper_style: "dark",
      background: "near-black",
      ink: 1.15,
      margin: 1.2,
      density: 0.75,
      pfl_style: "pfl-afterimage",
    },
  },
];

export function styleById(id: string): PflStyle | undefined {
  return PFL_STYLES.find((s) => s.id === id);
}

export function applyStyle(
  params: Record<string, number | string | boolean>,
  styleId: string,
): Record<string, number | string | boolean> {
  const style = styleById(styleId);
  if (!style) return { ...params };
  return { ...params, ...style.parameters };
}

export type MutationScale = "subtle" | "moderate" | "wild";

export const MUTATION_STRENGTH: Record<MutationScale, number> = {
  subtle: 0.08,
  moderate: 0.18,
  wild: 0.42,
};
