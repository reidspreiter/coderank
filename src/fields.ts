import { CharData, CharMap, addCharMaps } from "./chars";
import { RANK_SIZE } from "./common";

export type Fields = {
    rank: number;
    total: number;
    added: number;
    deleted: number;
    chars: CharData;
    rankBuffer: number;
};

export type FieldsJSON = {
    rank: number;
    total: number;
    added: number;
    deleted: number;
    chars: CharMap;
    rankBuffer: number;
};

export type FieldsJSONWeek = FieldsJSON & {
    week: number;
};

export type FieldsJSONBig = {
    rank: number;
    total: bigint;
    added: bigint;
    deleted: bigint;
    chars: CharMap;
    rankBuffer: number;
};

type FieldType = {
    base: Fields;
    json: FieldsJSON;
    jsonWeek: FieldsJSONWeek;
    jsonBig: FieldsJSONBig;
};

export function buildFields<T extends keyof FieldType>(
    type: T,
    options: Partial<FieldType[T]> = {}
): FieldType[T] {
    const defaultFields: any = {
        rank: 0,
        total: type === "jsonBig" ? BigInt(0) : 0,
        added: type === "jsonBig" ? BigInt(0) : 0,
        deleted: type === "jsonBig" ? BigInt(0) : 0,
        rankBuffer: 0,
        chars: type === "base" ? new CharData() : {},
    };

    if (type === "jsonWeek") {
        defaultFields.week = 0;
    }

    return {
        ...defaultFields,
        ...options,
    } as FieldType[T];
}

function add(a: bigint | number, b: bigint | number): bigint | number {
    if (typeof a === "bigint" || typeof b === "bigint") {
        return BigInt(a) + BigInt(b);
    }
    return a + b;
}

export function addFields<T extends keyof FieldType>(
    type: T,
    base: FieldType[T],
    addend: FieldType[T]
): FieldType[T] {
    const { added, deleted, rank, rankBuffer, chars } = addend;

    const sum: any = {
        rank: base.rank + rank,
        added: add(base.added, added),
        deleted: add(base.deleted, deleted),
        rankBuffer: base.rankBuffer + rankBuffer,
    };
    sum.total = sum.added - sum.deleted;

    if (sum.rankBuffer >= RANK_SIZE) {
        sum.rankBuffer -= RANK_SIZE;
        sum.rank++;
    }

    if ("week" in base) {
        sum.week = base.week;
    }

    sum.chars =
        type === "base"
            ? new CharData(addCharMaps(base.chars.map as CharMap, chars.map as CharMap))
            : addCharMaps(base.chars as CharMap, chars as CharMap);

    return sum as FieldType[T];
}

export function convertFields<T extends "base" | "json" | "jsonWeek", Y extends keyof FieldType>(
    to: Y,
    fields: FieldType[T],
    defaultWeek: number = 0
): FieldType[Y] {
    const { rank, total, added, deleted, chars, rankBuffer } = fields;

    const newFields: any = {
        rank,
        total: to === "jsonBig" ? BigInt(total) : total,
        added: to === "jsonBig" ? BigInt(added) : added,
        deleted: to === "jsonBig" ? BigInt(deleted) : deleted,
        chars:
            to === "base" ? ("_map" in chars ? chars : new CharData(chars)) : (chars.map ?? chars),
        rankBuffer,
    };

    if (to === "jsonWeek") {
        newFields.week = "week" in fields ? fields.week : defaultWeek;
    }

    return newFields as FieldType[Y];
}
