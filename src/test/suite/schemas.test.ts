import * as assert from "assert";
import { promises as fs } from "fs";

import { afterEach } from "mocha";
import sinon from "sinon";
import { z } from "zod";

import * as s from "../../schemas/index.js";

function createCharMap(
    record: Record<string, number>,
    options: { typed: boolean } = { typed: true }
): s.CharMap {
    const charMap = s.CharMapSchema.parse({});
    for (const key in record) {
        const a = record[key];
        charMap[key] = s.CharMapValueSchema.parse(
            options.typed ? { added: a, added_typed: a } : { added: a, added_pasted: a }
        );
    }
    return charMap;
}

function doubleObject(obj: object): object {
    function iterateAndDouble(o: any): void {
        for (const key in o) {
            if (typeof o[key] === "object") {
                iterateAndDouble(o[key]);
            } else if (typeof o[key] === "number") {
                o[key] += o[key];
            }
        }
    }
    iterateAndDouble(obj);
    return obj;
}

function createFileFromMachineRegistry(
    machineRegistries: s.MachineRegistry[],
    year: string,
    week: string
): s.CoderankFile {
    const file = s.CoderankFileSchema.parse({
        years: {
            [year]: s.CoderankStatsSchema.parse({
                machines: {},
            }),
        },
        pastFiveWeeks: {
            [week]: s.CoderankStatsSchema.parse({
                machines: {},
            }),
        },
    });

    for (const registry of machineRegistries) {
        const machineData = s.MachineMapValueSchema.parse({ name: registry.name });
        file.years[year].machines[registry.id] = machineData;
        file.pastFiveWeeks[week].machines[registry.id] = machineData;
    }
    return file;
}

suite("Test schemas", () => {
    suite("Test `readJSONFile`", () => {
        const testSchema = z.object({ number: z.number() });

        afterEach(() => {
            sinon.restore();
        });

        test("Return null if file not found", async () => {
            sinon.stub(fs, "readFile").rejects({ code: "ENOENT" });

            const result = await s.readJSONFile("nonexistent.json", z.object({}));
            assert.strictEqual(result, null);
        });

        test("Throw an error if file contains invalid json", async () => {
            sinon.stub(fs, "readFile").resolves("not valid json");

            await assert.rejects(async () => {
                await s.readJSONFile("test.json", testSchema);
            }, /JSON Parsing Error:/);
        });

        test("Throw a validation error if schema does not match", async () => {
            sinon.stub(fs, "readFile").resolves(JSON.stringify({ number: "8" }));

            await assert.rejects(async () => {
                await s.readJSONFile("test.json", testSchema);
            }, /Validation Error:/);
        });

        test("Return data if validation succeeds", async () => {
            const expected = { number: 8 };
            sinon.stub(fs, "readFile").resolves(JSON.stringify(expected));

            const actual = await s.readJSONFile("test.json", testSchema);
            assert.deepStrictEqual(actual, expected);
        });
    });

    suite("Test `parseStringToCharMap", () => {
        test("Test pasted", () => {
            const text = "x\n\r9  9 \t 88\t8";
            const expected = createCharMap(
                { x: 1, "\n": 1, "9": 2, " ": 4, "\t": 2, "8": 3 },
                { typed: false }
            );
            const charMap = s.parseStringToCharMap(text);
            assert.deepStrictEqual(charMap, expected);
        });

        test("Test typed", () => {
            const text = "\n\r";
            const expected = createCharMap({ "\n": 1 });
            const charMap = s.parseStringToCharMap(text);
            assert.deepStrictEqual(charMap, expected);
        });

        test("Test add to base", () => {
            const base = createCharMap({ x: 2, y: 5 }, { typed: false });
            const text = "x77";
            const expected = createCharMap({ x: 3, y: 5, "7": 2 }, { typed: false });
            const charMap = s.parseStringToCharMap(text, base);
            assert.deepStrictEqual(charMap, expected);
        });
    });

    suite("Test summing", () => {
        test("Test `sumCharMaps`", () => {
            const map1 = createCharMap({ x: 300, y: 8 });
            const map2 = createCharMap({ b: 50, " ": 1, x: 1 });
            const expected = createCharMap({ x: 301, y: 8, b: 50, " ": 1 });
            const actual = s.sumCharMaps(map1, map2);
            assert.deepStrictEqual(actual, expected);
        });

        const year = "2025";
        const week = "2";
        const machineRegistry = s.MachineRegistrySchema.parse({
            name: "work",
            id: "497dcba3-ecbf-4587-a2dd-5eb0665e6880",
        });
        const chars = createCharMap({ x: 8, "7": 2 });
        const languages = s.LangMapSchema.parse({
            foober: {
                rank: 0.004,
                added: 50,
                added_typed: 3,
                added_pasted: 2,
                num_pastes: 1,
                deleted: 500,
                deleted_typed: 100,
                deleted_cut: 400,
                num_cuts: 7,
                chars: { ...chars },
            },
            goo: {
                rank: 0.02,
                deleted: 500,
            },
        });
        const localFile = s.CoderankFileSchema.parse({
            years: {
                [year]: s.CoderankStatsSchema.parse({
                    machines: {
                        [machineRegistry.id]: {
                            name: machineRegistry.name,
                            editors: {
                                [s.EDITOR_NAME]: {
                                    languages: { ...languages },
                                },
                            },
                        },
                    },
                }),
            },
            pastFiveWeeks: {
                "2": s.CoderankStatsSchema.parse({
                    machines: {
                        [machineRegistry.id]: {
                            name: machineRegistry.name,
                            editors: {
                                [s.EDITOR_NAME]: {
                                    languages: { ...languages },
                                },
                            },
                        },
                    },
                }),
                "1": {
                    machines: {},
                },
                "52": {
                    machines: {},
                },
                "51": {
                    machines: {},
                },
                "50": {
                    machines: {},
                },
            },
        });
        suite("Test `sumBufferToLocalFile`", () => {
            const buffer = s.CoderankBufferSchema.parse({
                languages: { ...languages },
            });
            test("Empty local file", () => {
                const expected = localFile;
                const actual = s.sumBufferToLocalFile(
                    s.CoderankFileSchema.parse({}),
                    buffer,
                    week,
                    year,
                    machineRegistry
                );
                assert.deepStrictEqual(actual, expected);
            });

            test("Populated local file", () => {
                const expected = doubleObject(s.clone(localFile, s.CoderankFileSchema));
                const actual = s.sumBufferToLocalFile(
                    s.clone(localFile, s.CoderankFileSchema),
                    buffer,
                    week,
                    year,
                    machineRegistry
                );
                assert.deepStrictEqual(actual, expected);
            });
        });

        suite("Test `sumLocalFileToRemoteFile`", () => {
            const remoteFile = s.CoderankFileSchema.parse({
                ...localFile.years[year],
                ...localFile,
            });
            test("Empty remote file", () => {
                const expected = remoteFile;
                const actual = s.sumLocalFileToRemoteFile(
                    s.CoderankFileSchema.parse({}),
                    localFile
                );
                assert.deepStrictEqual(actual, expected);
            });

            test("Populated remote file", () => {
                const expected = doubleObject(s.clone(remoteFile, s.CoderankFileSchema));
                const actual = s.sumLocalFileToRemoteFile(
                    s.clone(remoteFile, s.CoderankFileSchema),
                    localFile
                );
                assert.deepStrictEqual(actual, expected);
            });
        });
    });

    suite("Test machine updates", () => {
        const id = "497dcba3-ecbf-4587-a2dd-5eb0665e6880";
        const machineRegistry = s.MachineRegistrySchema.parse({ name: "work", id });
        const year = "2020";
        const week = "2";

        test("Test `updateMachineField`", () => {
            const newMachineName = "home";
            const newMachineRegistry = s.MachineRegistrySchema.parse({ name: newMachineName, id });
            const expectedFile = createFileFromMachineRegistry([newMachineRegistry], year, week);
            const actualFile = s.updateMachineField(
                createFileFromMachineRegistry([machineRegistry], year, week),
                id,
                "name",
                newMachineName
            );
            assert.deepStrictEqual(actualFile, expectedFile);
        });

        test("Test `reconfigureMachine`", () => {
            const baseMachineRegistry = s.MachineRegistrySchema.parse({
                name: "home",
                id: "50e14f43-dd4e-412f-864d-78943ea28d91",
            });
            const expectedFile = createFileFromMachineRegistry([baseMachineRegistry], year, week);
            const actualFile = s.reconfigureMachine(
                createFileFromMachineRegistry([machineRegistry, baseMachineRegistry], year, week),
                baseMachineRegistry.id,
                baseMachineRegistry.name,
                machineRegistry.id
            );
            assert.deepStrictEqual(actualFile, expectedFile);
        });
    });
});
