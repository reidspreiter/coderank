import * as assert from "assert";
import exp from "constants";

import * as tmp from "tmp";
import * as vscode from "vscode";

import { CharData, CharMap, addCharMaps } from "../characters";
import { RANK_SIZE, stringify, parse } from "../common";
import { buildFields, addFields, convertFields, FieldsJSONBig } from "../fields";
import { Stats } from "../stats";

suite("Coderank Test Suite", () => {
    vscode.window.showInformationMessage("Start all coderank tests.");

    // let tempDir: string;
    // let context: any;

    // setup(() => {
    //     tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
    //     context = {
    //         globalStorageUri: vscode.Uri.file(tempDir),
    //     };
    // });

    // teardown(() => {
    //     tempDir = "";
    //     context = {};
    // });

    suite("buildFields", () => {
        suite("build base", () => {
            test("from nothing", () => {
                const expected = {
                    rank: 0,
                    total: 0,
                    added: 0,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: new CharData(),
                };
                const fields = buildFields("base");
                assert.deepStrictEqual(fields, expected);
            });

            test("from partial", () => {
                const expected = {
                    rank: 2,
                    total: 0,
                    added: 2,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: new CharData(),
                };
                const fields = buildFields("base", { rank: 2, added: 2 });
                assert.deepStrictEqual(fields, expected);
            });
        });

        suite("build json", () => {
            test("from nothing", () => {
                const expected = {
                    rank: 0,
                    total: 0,
                    added: 0,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: {},
                };
                const fields = buildFields("json");
                assert.deepStrictEqual(fields, expected);
            });

            test("from partial", () => {
                const expected = {
                    rank: 2,
                    total: 0,
                    added: 2,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: {},
                };
                const fields = buildFields("json", { rank: 2, added: 2 });
                assert.deepStrictEqual(fields, expected);
            });
        });

        suite("build jsonWeek", () => {
            test("from nothing", () => {
                const expected = {
                    rank: 0,
                    total: 0,
                    added: 0,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: {},
                    week: 0,
                };
                const fieldsJSONWeek = buildFields("jsonWeek");
                assert.deepStrictEqual(fieldsJSONWeek, expected);
            });

            test("from partial", () => {
                const expected = {
                    rank: 2,
                    total: 0,
                    added: 2,
                    deleted: 0,
                    rankBuffer: 0,
                    chars: {},
                    week: 5,
                };
                const fields = buildFields("jsonWeek", { week: 5, rank: 2, added: 2 });
                assert.deepStrictEqual(fields, expected);
            });
        });

        suite("build jsonBig", () => {
            test("from nothing", () => {
                const expected = {
                    rank: 0,
                    total: BigInt(0),
                    added: BigInt(0),
                    deleted: BigInt(0),
                    rankBuffer: 0,
                    chars: {},
                };
                const fieldsJSONBig = buildFields("jsonBig");
                assert.deepStrictEqual(fieldsJSONBig, expected);
            });

            test("from partial", () => {
                const expected = {
                    rank: 2,
                    total: BigInt(0),
                    added: BigInt(2),
                    deleted: BigInt(0),
                    rankBuffer: 0,
                    chars: {},
                };
                const fields = buildFields("jsonBig", { rank: 2, added: BigInt(2) });
                assert.deepStrictEqual(fields, expected);
            });
        });
    });

    suite("convertFields", () => {
        const fields = buildFields("base", { added: 1, chars: new CharData({ a: 2, b: 1 }) });
        const fieldsJSON = buildFields("json", { added: 1, chars: { a: 2, b: 1 } });
        const fieldsJSONWeek = buildFields("jsonWeek", { added: 1, chars: { a: 2, b: 1 } });
        const fieldsJSONBig = buildFields("jsonBig", { added: BigInt(1), chars: { a: 2, b: 1 } });

        const from = [fields, fieldsJSON, fieldsJSONWeek];
        const types = ["base", "json", "jsonWeek"];

        from.forEach((fromFields, index) => {
            const type = types[index];
            suite(`convert ${type}`, () => {
                test("to base", () => {
                    assert.deepStrictEqual(convertFields("base", fromFields), fields);
                });
                test("to json", () => {
                    assert.deepStrictEqual(convertFields("json", fromFields), fieldsJSON);
                });
                test("to jsonWeek", () => {
                    assert.deepStrictEqual(convertFields("jsonWeek", fromFields), fieldsJSONWeek);
                });
                test("to jsonBig", () => {
                    assert.deepStrictEqual(convertFields("jsonBig", fromFields), fieldsJSONBig);
                });
            });
        });
    });

    suite("addFields", () => {
        let fields1: any = buildFields("base", {
            added: 3,
            rankBuffer: 9999,
            chars: new CharData({ a: 2 }),
        });
        let fields2: any = buildFields("base", {
            deleted: 1,
            rankBuffer: 1,
            chars: new CharData({ a: 1, b: 4 }),
        });
        let expected: any = buildFields("base", {
            added: 3,
            deleted: 1,
            rank: 1,
            total: 2,
            chars: new CharData({ a: 3, b: 4 }),
        });

        test("add base", () => {
            assert.deepStrictEqual(addFields("base", fields1, fields2), expected);
        });

        test("add json", () => {
            fields1 = convertFields("json", fields1);
            fields2 = convertFields("json", fields2);
            expected = convertFields("json", expected);
            assert.deepStrictEqual(addFields("json", fields1, fields2), expected);
        });

        test("add jsonWeek", () => {
            fields1 = convertFields("jsonWeek", fields1);
            fields2 = convertFields("jsonWeek", fields2);
            expected = convertFields("jsonWeek", expected);
            assert.deepStrictEqual(addFields("jsonWeek", fields1, fields2), expected);
        });

        test("add jsonBig", () => {
            fields1 = convertFields("jsonBig", fields1);
            fields2 = convertFields("jsonBig", fields2);
            expected = convertFields("jsonBig", expected);
            assert.deepStrictEqual(addFields("jsonBig", fields1, fields2), expected);
        });
    });

    suite("charData", () => {
        test("initialize default", () => {
            const charData = new CharData();
            const expected = {};
            assert.deepStrictEqual(charData.map, expected);
        });

        test("initialize from map", () => {
            const charData = new CharData({ a: 1, " ": 2 });
            const expected = { " ": 2, a: 1 };
            assert.deepStrictEqual(Object.entries(charData.map), Object.entries(expected));
        });

        test("map a string of text", () => {
            const charData = new CharData({ a: 2, " ": 2 });
            charData.mapText("tt tt\nh.");
            const expected = { t: 4, " ": 3, a: 2, "\n": 1, h: 1, ".": 1 };
            assert.deepStrictEqual(Object.entries(charData.map), Object.entries(expected));
        });

        test("add charmaps", () => {
            const base = { a: 50, " ": 2, "\n": 5 };
            const addend = { b: 50, " ": 5, "\n": 100, a: 5 };
            const expected = { a: 55, b: 50, " ": 7, "\n": 105 };
            assert.deepStrictEqual(addCharMaps(base, addend), expected);
        });
    });

    suite("common", () => {
        const fieldsJSON = buildFields("json", { total: 5, added: 8, deleted: 3 });
        const fieldsJSONBig = convertFields("jsonBig", fieldsJSON);
        const stringified = stringify(fieldsJSONBig);

        test("stringify bigints to strings", () => {
            const expected =
                '{"rank":0,"total":"5","added":"8","deleted":"3","chars":{},"rankBuffer":0}';
            assert.deepStrictEqual(stringified, expected);
        });

        test("parse strings to bigints", () => {
            const parsed = parse<FieldsJSONBig>(stringified);
            assert.deepStrictEqual(parsed, fieldsJSONBig);
        });
    });

    // test("Stats", () => {
    //     const stats = new Stats(context);

    //     test("updateProjectRank", () => {
    //         stats.project.rankBuffer = RANK_SIZE + 3;
    //         stats.updateProjectRank();
    //         assert.strictEqual(stats.project.rank, 1);
    //         assert.strictEqual(stats.project.rankBuffer, 3);
    //     });
    // });
});
