import { QuickPickItem, window } from "vscode";

export interface CharHashMap {
	[key: string]: number;
}

export type CharSortOrder = "keyAsc" | "keyDesc" | "valAsc" | "valDesc";

export class CharData {
	private map: CharHashMap;
	private sortOrder: CharSortOrder = "valDesc";
	private lengthWhenLastSorted = 0;

	constructor() {
		this.map = {};
	}

	inputData(text: string): void {
		for (const char of text) {
			if (char === "\r") {
				continue;
			}
			if (char in this.map) {
				this.map[char] += 1;
			} else {
				this.map[char] = 1;
			}
		}
	}

	getMap(): CharHashMap {
		const length = Object.keys(this.map).length;
		if (length !== this.lengthWhenLastSorted) {
			this.sortMap();
			this.lengthWhenLastSorted = length;
		}
		return this.map;
	}

	sortMap(): void {
		let entries = Object.entries(this.map);
		switch (this.sortOrder) {
			case "keyAsc":
				entries.sort(([key1], [key2]) => key1.localeCompare(key2));
				break;
			case "keyDesc":
				entries.sort(([key1], [key2]) => key2.localeCompare(key1));
				break;
			case "valAsc":
				entries.sort(([, val1], [, val2]) => val1 - val2);
				break;
			case "valDesc":
				entries.sort(([, val1], [, val2]) => val2 - val1);
				break;
		}
		this.map = {};
		for (const [key, val] of entries) {
			this.map[key] = val;
		}
	}

	setSortOrder(order: CharSortOrder): void {
		this.sortOrder = order;
		this.sortMap();
	}
}

class SortOrderQuickPickItem implements QuickPickItem {
    label: string;
    alias: CharSortOrder;

    constructor(label: string, alias: CharSortOrder) {
        this.label = label;
        this.alias = alias;
    }
}

export async function charSortQuickPick(): Promise<CharSortOrder | undefined> {
    const sortOrders: SortOrderQuickPickItem[] = [
			{label: "Character ascending", alias: "keyAsc"},
			{label: "Character descending", alias: "keyDesc"},
			{label: "Amount ascending", alias: "valAsc"},
			{label: "Amount descending", alias: "valDesc"},
		];

    const selectedOrder = await window.showQuickPick(sortOrders, {
        placeHolder: "Select a sort order"
    });

    return selectedOrder?.alias;
}