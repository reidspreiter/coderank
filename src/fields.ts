import { CharData, CharMap, combineCharMaps } from "./characters";
import { RANK_SIZE } from "./common";

export type Fields = {
    rank: number;
    total: number;
    added: number;
    deleted: number;
    chars: CharData;
    rankBuffer: number;
};

export type FieldsJSON = Fields & {
    chars: CharMap;
};

export type FieldsJSONWeek = Fields & {
    chars: CharMap;
    week: number;
};

export type FieldsJSONBig = Fields & {
    chars: CharMap;
    total: bigint;
    added: bigint;
    deleted: bigint;
};

type FieldType = {
    base: Fields;
    json: FieldsJSON;
    jsonWeek: FieldsJSONWeek;
    jsonBig: FieldsJSONBig;
};

type FieldValues = {
    base: Partial<Fields>;
    json: Partial<FieldsJSON>;
    jsonWeek: Partial<FieldsJSONWeek>;
    jsonBig: Partial<FieldsJSONBig>;
};

export function buildFields<T extends keyof FieldType>(
    type: T,
    options?: FieldValues[T]
): FieldType[T] {
    const defaultFields = {
        rank: 0,
        total: type === "jsonBig" ? BigInt(0) : 0,
        added: type === "jsonBig" ? BigInt(0) : 0,
        deleted: type === "jsonBig" ? BigInt(0) : 0,
        rankBuffer: 0,
        chars: type === "base" ? new CharData() : ({} as CharMap),
    };

    return {
        ...defaultFields,
        ...options,
    } as FieldType[T];
}

export function addFields<T extends keyof FieldType>(
    type: T,
    base: FieldType[T],
    addend: FieldType[T]
): FieldType[T] {
    const { added, deleted, rank, rankBuffer, chars } = addend;
    base.added += added;
    base.deleted += deleted;
    base.total = base.added - base.deleted;
    base.rank += rank;
    base.rankBuffer += rankBuffer;

    if (base.rankBuffer >= RANK_SIZE) {
        base.rankBuffer -= RANK_SIZE;
        base.rank++;
    }

    if (type === "base") {
        base.chars.append(chars.map);
    } else {
        (base.chars as CharMap) = combineCharMaps(base.chars as CharMap, chars as CharMap);
    }
    return base;
}

export function convertFields<T extends "base" | "json" | "jsonWeek", Y extends keyof FieldType>(
    to: Y,
    fields: FieldType[T]
): FieldType[Y] {
    const { rank, total, added, deleted, chars, rankBuffer } = fields;

    return {
        rank,
        total: to === "jsonBig" ? BigInt(total) : total,
        added: to === "jsonBig" ? BigInt(added) : added,
        deleted: to === "jsonBig" ? BigInt(deleted) : deleted,
        chars: to === "base" ? new CharData(chars as CharMap) : (chars.map ?? chars),
        rankBuffer,
    } as FieldType[Y];
}
