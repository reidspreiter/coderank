export type CharMap = {
    [key: string]: number;
};

export function combineCharMaps(target: CharMap, source: CharMap): CharMap {
    for (const [key, val] of Object.entries(source)) {
        target[key] = (target[key] ?? 0) + val;
    }
    return target;
}

export class CharData {
    private _map: CharMap;
    private lengthWhenLastSorted;

    constructor(map?: CharMap) {
        this._map = map ?? {};
        this.lengthWhenLastSorted = 0;
        this.sortMap();
    }

    mapText(text: string): void {
        for (const char of text) {
            if (char === "\r") {
                continue;
            }
            this._map[char] = (this._map[char] ?? 0) + 1;
        }
    }

    get map(): CharMap {
        const length = Object.keys(this._map).length;
        if (length !== this.lengthWhenLastSorted) {
            this.sortMap();
        }
        return this._map;
    }

    private sortMap(): void {
        const entries = Object.entries(this._map).sort(([, val1], [, val2]) => val2 - val1);
        this._map = Object.fromEntries(entries);
        this.lengthWhenLastSorted = this._map.length;
    }

    append(map: CharMap): void {
        this._map = combineCharMaps(this._map, map);
    }
}
