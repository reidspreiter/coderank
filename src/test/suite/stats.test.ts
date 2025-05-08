import * as assert from "assert";

import { beforeEach } from "mocha";
import * as v from "vscode";

import { Coderank } from "../../coderank/coderank.js";
import * as s from "../../schemas/index.js";
import { openTextDocument, getTestContext, writeText, deleteTextBeforeCursor } from "../util.js";

suite("Test stats", () => {
    suite("Test buffer", () => {
        const context = getTestContext();
        let coderank: Coderank;

        test("Active text editor change", async () => {
            coderank = await Coderank.init(context);
            v.window.onDidChangeActiveTextEditor((editor) => {
                coderank.buffer.updateLanguage(editor);
            });

            await openTextDocument("test.txt");
            assert.strictEqual(coderank.buffer.language, "plaintext");

            await openTextDocument("test.js");
            assert.strictEqual(coderank.buffer.language, "javascript");
        });

        suite("Test `parseTextDocumentChangeEvent`", () => {
            beforeEach(async () => {
                coderank = await Coderank.init(context);
                v.workspace.onDidChangeTextDocument((event) => {
                    coderank.buffer.parseTextDocumentChangeEvent(event);
                });
            });

            test("Insert and delete text", async () => {
                const expected = s.CoderankBufferSchema.parse({
                    languages: {
                        plaintext: s.MainStatsSchema.parse({
                            rank: 0.0003,
                            added: 4,
                            deleted: 4,
                            deleted_cut: 4,
                            num_cuts: 1,
                            num_pastes: 1,
                            added_typed: 1,
                            added_pasted: 3,
                            chars: {
                                a: {
                                    added: 3,
                                    added_pasted: 3,
                                },
                                d: {
                                    added: 1,
                                    added_typed: 1,
                                },
                            },
                        }),
                    },
                });
                await writeText("test.txt", "aaa");
                await writeText("test.txt", "d");
                await deleteTextBeforeCursor(4);
                const actual = coderank.buffer.data;
                actual.languages["plaintext"].rank = parseFloat(
                    actual.languages["plaintext"].rank.toFixed(4)
                );
                assert.deepStrictEqual(coderank.buffer.data, expected);
            });
        });
    });
});
