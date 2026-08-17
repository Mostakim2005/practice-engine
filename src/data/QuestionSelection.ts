export class QuestionSelection {
	private readonly selectedIds = new Set<string>();

	isSelected(id: string): boolean {
		return this.selectedIds.has(id);
	}

	select(id: string): void {
		this.selectedIds.add(id);
	}

	deselect(id: string): void {
		this.selectedIds.delete(id);
	}

	toggle(id: string): void {
		if (this.isSelected(id)) this.deselect(id);
		else this.select(id);
	}

	clear(): void {
		this.selectedIds.clear();
	}

	selectAll(ids: string[]): void {
		for (const id of ids) this.selectedIds.add(id);
	}

	invert(ids: string[]): void {
		for (const id of ids) {
			if (this.isSelected(id)) this.deselect(id);
			else this.select(id);
		}
	}

	getSelected(): string[] {
		return [...this.selectedIds];
	}

	size(): number {
		return this.selectedIds.size;
	}
}