import * as assert from "assert";
import { promises as fs } from "fs";

import sinon from "sinon";
import * as vscode from "vscode";
import { z } from "zod";

import * as s from "../schemata";
import { RANK_SIZE } from "../util/common";

suite("Coderank Test Suite", () => {
    vscode.window.showInformationMessage("Coderank tests");

    suite("Test schemata", () => {
        test("Zod ignore unnecessary properties", () => {
            const languageWithChars = s.LanguageWithCharsSchema.parse({
                chars: { k: 200 },
                added: 200,
            });
            const languageWithoutChars = s.LanguageSchema.parse(languageWithChars);
            const expected = s.LanguageSchema.parse({ added: 200 });
            assert.deepStrictEqual(languageWithoutChars, expected);
        });

        test("Test checkRankBufferOverflow", () => {
            let obj = { rank: 0, rankBuffer: RANK_SIZE + 3 };
            const expected = { rank: 1, rankBuffer: 3 };
            obj = s.checkRankBufferOverflow(obj);
            assert.deepStrictEqual(obj, expected);
        });

        suite("Handle bigints", () => {
            const bigSchema = z.object({ bigNumber: z.string().transform((x) => BigInt(x)) });
            const obj = { bigNumber: BigInt(500) };
            const stringified = s.stringify(obj);

            test("Stringify bigints to strings", () => {
                const expected = JSON.stringify({ bigNumber: "500" });
                assert.strictEqual(stringified, expected);
            });

            test("Parse bigint strings to bigints", () => {
                const parsed = bigSchema.parse(JSON.parse(stringified));
                assert.deepStrictEqual(parsed, obj);
            });
        });

        test("Test parseTextToCharMap", () => {
            const text = "x\n9\t88  9  ";
            const expected = { x: 1, "\n": 1, "9": 2, "\t": 1, "8": 2, " ": 4 };
            const charMap = s.parseTextToCharMap(text);
            assert.deepStrictEqual(charMap, expected);
        });

        test("Test sumCharMaps", () => {
            const map1 = { x: 300, y: 8 };
            const map2 = { b: 50, " ": 1, x: 1 };
            const expected = { x: 301, y: 8, b: 50, " ": 1 };
            const actual = s.sumCharMaps(map1, map2);
            assert.deepStrictEqual(actual, expected);
        });

        test("Test sumFields", () => {
            const fields1 = s.FieldsSchema.parse({
                rank: 1,
                added: 8,
                deleted: 7,
                net: 1,
                chars: { x: 8 },
                rankBuffer: RANK_SIZE - 1,
            });
            const fields2 = s.WeeklyFieldsSchema.parse({
                rank: 1,
                added: 90,
                deleted: 99,
                net: -9,
                chars: { y: 1, x: 3 },
                rankBuffer: 1,
            });
            const expected = s.FieldsSchema.parse({
                rank: 3,
                added: 98,
                deleted: 106,
                net: -8,
                chars: { x: 11, y: 1 },
                rankBuffer: 0,
            });
            const actual = s.sumFields(fields1, fields2);
            assert.deepStrictEqual(actual, expected);
        });

        suite("Test sumLanguages", () => {
            let languages1: s.Language[];
            let languages2: s.LanguageWithChars[];

            const initLanguages = () => {
                languages1 = [
                    s.LanguageSchema.parse({ language: "python", addded: 8, deleted: 7 }),
                    s.LanguageSchema.parse({ added: 8 }),
                ];
                languages2 = [
                    s.LanguageWithCharsSchema.parse({
                        language: "rust",
                        added: 2,
                        chars: { x: 1, y: 1 },
                    }),
                    s.LanguageWithCharsSchema.parse({ added: 9, deleted: 2, chars: { x: 9 } }),
                ];
            };

            test("Add LanguageWithChars to Language", () => {
                initLanguages();
                const expected = [
                    s.LanguageSchema.parse({ language: "python", addded: 8, deleted: 7 }),
                    s.LanguageSchema.parse({ added: 17, deleted: 2 }),
                    s.LanguageSchema.parse({ language: "rust", added: 2 }),
                ];
                const actual = s.sumLanguages(languages1, languages2);
                assert.deepStrictEqual(actual, expected);
            });

            test("Add Language to LanguageWithChars", () => {
                initLanguages();
                const expectedWithChars = [
                    s.LanguageWithCharsSchema.parse({
                        language: "rust",
                        added: 2,
                        chars: { x: 1, y: 1 },
                    }),
                    s.LanguageWithCharsSchema.parse({ added: 17, deleted: 2, chars: { x: 9 } }),
                    s.LanguageWithCharsSchema.parse({
                        language: "python",
                        addded: 8,
                        deleted: 7,
                        chars: {},
                    }),
                ];
                const actualWithChars = s.sumLanguages(languages2, languages1, true);
                assert.deepStrictEqual(actualWithChars, expectedWithChars);
            });
        });

        suite("Test readJSONFile", () => {
            const testSchema = z.object({ number: z.number() });

            test("Return null if file not found", async () => {
                sinon.restore();
                sinon.stub(fs, "readFile").rejects({ code: "ENOENT" });

                const result = await s.readJSONFile("nonexistent.json", z.object({}));
                assert.strictEqual(result, null);
            });

            test("Throw an error if file contains invalid json", async () => {
                sinon.restore();
                sinon.stub(fs, "readFile").resolves("not valid json");

                await assert.rejects(async () => {
                    await s.readJSONFile("test.json", testSchema);
                }, /JSON Parsing Error:/);
            });

            test("Throw a validation error if schema does not match", async () => {
                sinon.restore();
                sinon.stub(fs, "readFile").resolves(JSON.stringify({ number: "8" }));

                await assert.rejects(async () => {
                    await s.readJSONFile("test.json", testSchema);
                }, /Validation Error:/);
            });

            test("Return data if validation succeeds", async () => {
                const expected = { number: 8 };
                sinon.restore();
                sinon.stub(fs, "readFile").resolves(JSON.stringify(expected));

                const actual = await s.readJSONFile("test.json", testSchema);
                assert.deepStrictEqual(actual, expected);
            });
        });
    });
});
