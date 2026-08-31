export class SelectionState {
  readonly ids: readonly string[];
  private readonly chosen = new Set<string>();

  constructor(ids: readonly string[]) {
    this.ids = [...ids];
    this.selectAll();
  }

  get selected(): ReadonlySet<string> {
    return this.chosen;
  }

  get count(): number {
    return this.chosen.size;
  }

  set(id: string, selected: boolean): void {
    if (!this.ids.includes(id)) return;
    if (selected) this.chosen.add(id);
    else this.chosen.delete(id);
  }

  selectAll(): void {
    this.chosen.clear();
    for (const id of this.ids) this.chosen.add(id);
  }

  selectNone(): void {
    this.chosen.clear();
  }
}
