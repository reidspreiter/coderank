import { QuickPickItem, window } from "vscode";

export interface CharHashMap {
	[key: string]: number;
}

export type CharSortOrder = "keyAsc" | "keyDesc" | "valAsc" | "valDesc";

type CharDataOptions = {
	map?: CharHashMap,
	sortOrder?: CharSortOrder,
};

export class CharData {
	private _map: CharHashMap;
	private _sortOrder: CharSortOrder;
	private lengthWhenLastSorted;

	constructor({map, sortOrder}: CharDataOptions = {}) {
		this._map = map ?? {};
		this._sortOrder = sortOrder ?? "valDesc";
		this.lengthWhenLastSorted = 0;
		this.sortMap();
	}

	static fromJSON(json: any): CharData {
		const {map, sortOrder} = json;
		return new CharData({map, sortOrder});
	}

	input(text: string): void {
		for (const char of text) {
			if (char === "\r") {
				continue;
			}
			if (char in this._map) {
				this._map[char] += 1;
			} else {
				this._map[char] = 1;
			}
		}
	}

	get map(): CharHashMap {
		const length = Object.keys(this._map).length;
		if (length !== this.lengthWhenLastSorted) {
			this.sortMap();
		}
		return this._map;
	}

	get sortOrder(): CharSortOrder {
		return this._sortOrder;
	}

	sortMap(sortOrder?: CharSortOrder): void {
		this._sortOrder = sortOrder ?? this._sortOrder;
		let entries = Object.entries(this._map);
		this.lengthWhenLastSorted = entries.length;
		switch (this._sortOrder) {
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
		this._map = {};
		for (const [key, val] of entries) {
			this._map[key] = val;
		}
	}

	append(map: CharHashMap): void {
		for (const [key, val] of Object.entries(map)) {
			if (key in this._map) {
				this._map[key] += val;
			} else {
				this._map[key] = val;
			}
		}
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
			{label: "Ascending by character", alias: "keyAsc"},
			{label: "Descending by character", alias: "keyDesc"},
			{label: "Ascending by amount", alias: "valAsc"},
			{label: "Descending by amount", alias: "valDesc"},
		];

    const selectedOrder = await window.showQuickPick(sortOrders, {
        placeHolder: "Select a sort order"
    });

    return selectedOrder?.alias;
}