/**
 * Centralized Studio keyboard command registry.
 * The help overlay reads from the same registry — no hand-maintained drift.
 */

export type StudioMode = "generate" | "animate" | "react";

export type CommandContext = {
  mode: StudioMode;
  controlsVisible: boolean;
  helpVisible: boolean;
  hudVisible: boolean;
  playing: boolean;
  fullscreen: boolean;
};

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

export type CommandDef = {
  id: string;
  /** Display chord, e.g. "?" or "Shift+R" */
  keys: string;
  /** Normalized matchers: "?", "tab", "1", "shift+r", "space", "escape", "`" */
  match: string[];
  label: string;
  group: "global" | "generate" | "animate" | "react";
  /** If set, only active in these modes (global still always listed). */
  modes?: StudioMode[];
  handler: CommandHandler;
};

/** Normalized chord string used for registry matching (exported for tests). */
export function keyboardChordFromEvent(e: KeyboardEvent): string {
  // Physical ? on US QWERTY is Shift+/; browsers often emit key "?" with shiftKey set.
  if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
    const mods: string[] = [];
    if (e.altKey) mods.push("alt");
    if (e.metaKey) mods.push("meta");
    if (e.ctrlKey) mods.push("ctrl");
    mods.push("shift", "/");
    return mods.join("+");
  }

  const parts: string[] = [];
  if (e.shiftKey && e.key !== "Shift") parts.push("shift");
  if (e.altKey && e.key !== "Alt") parts.push("alt");
  if (e.metaKey && e.key !== "Meta") parts.push("meta");
  if (e.ctrlKey && e.key !== "Control") parts.push("ctrl");
  let key = e.key;
  if (key === " ") key = "space";
  if (key === "Escape") key = "escape";
  if (key === "Tab") key = "tab";
  if (key.length === 1) key = key.toLowerCase();
  else key = key.toLowerCase();
  // Avoid "shift+shift+r" when Shift+R: use e.code for letters with shift
  if (e.shiftKey && /^[a-z]$/i.test(e.key)) {
    return `shift+${e.key.toLowerCase()}`;
  }
  parts.push(key.toLowerCase());
  return parts.join("+");
}

export class KeyboardRegistry {
  private commands: CommandDef[] = [];
  private enabled = true;

  register(cmd: CommandDef): void {
    this.commands.push(cmd);
  }

  registerAll(cmds: CommandDef[]): void {
    for (const c of cmds) this.register(c);
  }

  clear(): void {
    this.commands = [];
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  list(mode?: StudioMode): CommandDef[] {
    return this.commands.filter((c) => {
      if (!mode) return true;
      if (c.group === "global") return true;
      if (c.modes && !c.modes.includes(mode)) return false;
      return c.group === mode;
    });
  }

  /** All commands for help overlay, grouped. */
  helpCatalog(mode: StudioMode): { global: CommandDef[]; mode: CommandDef[] } {
    const global = this.commands.filter((c) => c.group === "global");
    const modeCmds = this.commands.filter((c) => {
      if (c.group === "global") return false;
      return c.group === mode || !!c.modes?.includes(mode);
    });
    return { global, mode: modeCmds };
  }

  handle(e: KeyboardEvent, ctx: CommandContext): boolean {
    if (!this.enabled) return false;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      if (e.key !== "Escape") return false;
    }
    const chord = keyboardChordFromEvent(e);
    for (const cmd of this.commands) {
      if (cmd.modes && !cmd.modes.includes(ctx.mode) && cmd.group !== "global") continue;
      if (cmd.group !== "global" && cmd.group !== ctx.mode && !cmd.modes?.includes(ctx.mode)) {
        continue;
      }
      if (cmd.match.includes(chord)) {
        e.preventDefault();
        void cmd.handler(ctx);
        return true;
      }
    }
    return false;
  }
}

export function createStudioRegistry(): KeyboardRegistry {
  return new KeyboardRegistry();
}
