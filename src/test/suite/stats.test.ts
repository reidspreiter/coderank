import * as assert from "assert";

import { beforeEach } from "mocha";
import * as v from "vscode";

import { Coderank } from "../../coderank/coderank.js";
import * as s from "../../schemas/index.js";
import { openTextDocument, getTestContext, writeText, deleteTextBeforeCursor } from "../util.js";

function textContentEvent(range: v.Range, rangeLength: number, text: string = "", rangeOffset: number = 0): v.TextDocumentContentChangeEvent {
    return {
        range,
        rangeOffset,
        rangeLength,
        text,
    };
}

function textEvent(scheme: string, fileName: string, contentChanges: v.TextDocumentContentChangeEvent[] = []): v.TextDocumentChangeEvent {
    return {
        document: {
            uri: v.Uri.from({scheme}),
            fileName,
            isUntitled: false,
            languageId: "unknown",
            version: 1,
            isDirty: false,
            isClosed: false,
            eol: v.EndOfLine.CRLF,
            lineCount: 1,
            save(): Thenable<boolean> {
                return Promise.resolve(true);
            },

            lineAt(lineOrPosition: number | v.Position): v.TextLine {
                return {
                    lineNumber: 0,
                    text: "",
                    range: new v.Range(0, 0, 0, 0),
                    rangeIncludingLineBreak: new v.Range(0, 0, 0, 0),
                    firstNonWhitespaceCharacterIndex: 0,
                    isEmptyOrWhitespace: true,
                };
            },

            offsetAt(position: v.Position): number {
                return 0;
            },

            positionAt(offset: number): v.Position {
                return new v.Position(0, 0);
            },

            getText(range?: v.Range): string {
                return "";
            },

            getWordRangeAtPosition(position: v.Position, regex?: RegExp): v.Range | undefined {
                return undefined;
            },

            validateRange(range: v.Range): v.Range {
                return range;
            },

            validatePosition(position: v.Position): v.Position {
                return position;
            }
        },
        contentChanges,
        reason: undefined,
    };
}

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
            suite("Manual edits", () => {
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

            suite("Git", () => {
                const zEvent = textEvent("file", "extension.ts", [
                    textContentEvent(new v.Range(20, 44, 20, 44), 0, "z"),
                ]);

                const params = [
                    {
                        eventSequenceName: "Commit",
                        events: [
                            textEvent("vscode-scm", "extension.ts", [
                                textContentEvent(new v.Range(0, 0, 0, 0), 0),
                            ]),
                            textEvent("vscode-scm", "input", [
                                textContentEvent(new v.Range(0, 0, 0, 0), 0),
                            ]),
                            textEvent("git", "extension.ts.git", [
                                textContentEvent(new v.Range(18, 0, 24, 0), 255, "random giberish"),
                            ]),
                            textEvent("file", "COMMIT_EDITMSG", [
                                textContentEvent(new v.Range(0, 0, 0, 0), 0, "j"),
                            ]),
                            textEvent("file", "COMMIT_EDITMSG"),
                            textEvent("file", "extension.ts"),
                        ],
                    },
                    {
                        eventSequenceName: "Rebase with merge conflict",
                        events: [
                            textEvent("git-rebase-todo", "file", [
                                textContentEvent(new v.Range(1, 0, 1, 35), 35),
                            ]),
                            textEvent("git-rebase-todo", "file"),
                            textEvent("git-rebase-todo", "file", [
                                textContentEvent(new v.Range(0, 0, 34, 0), 1578, "pick d3549d462be573e66225febb6b350812062aa25a"),
                            ]),
                            textEvent("stats.test.ts", "file", [
                                textContentEvent(new v.Range(0, 0, 185, 0), 6887, "file contents"),
                            ]),
                            textEvent("stats.test.ts", "file", [
                                textContentEvent(new v.Range(9, 0, 181, 0), 6719, "<<<<<<< HEADfile contents during merge conflict=======more contents>>>>>>> 897511c (test commit to reorder)"),
                            ]),
                            textEvent("stats.test.ts", "git", [
                                textContentEvent(new v.Range(9, 0, 181, 0), 6547, "file contents"),
                            ]),
                            textEvent("stats.test.ts", "file"),
                            textEvent("stats.test.ts", "file", [
                                textContentEvent(new v.Range(0, 0, 118, 0), 4884, "file contents"),
                            ]),
                            textEvent("stats.test.ts", "file", [
                                textContentEvent(new v.Range(35, 0, 114, 0), 3617, "contents moved for rebase"),
                            ]),
                            textEvent("stats.test.ts", "file"),
                            textEvent("input", "vscode-scm", [
                                textContentEvent(new v.Range(0, 0, 0, 0), 0, "commit message"),
                            ]),
                            textEvent("input", "vscode-scm", [
                                textContentEvent(new v.Range(0, 0, 0, 22), 22),
                            ]),
                            textEvent("input", "vscode-scm", [
                                textContentEvent(new v.Range(0, 0, 0, 0), 0),
                            ]),
                            textEvent("stats.test.ts", "file", [
                                textContentEvent(new v.Range(9, 0, 68, 0), 2480, "file contents"),
                            ]),
                        ],
                    },
                ];

                for (const param of params) {
                    test(param.eventSequenceName, async () => {
                        coderank = await Coderank.init(context);

                        for (const event of param.events) {
                            coderank.buffer.parseTextDocumentChangeEvent(event);
                        }
                        coderank.buffer.parseTextDocumentChangeEvent(zEvent);

                        let addedTotal = 0;
                        let zTotal = 0;

                        for (const language in coderank.buffer.data.languages) {
                            addedTotal += coderank.buffer.data.languages[language].added;
                            zTotal += coderank.buffer.data.languages[language].chars["z"].added;
                        }

                        assert.equal(addedTotal, 1);
                        assert.equal(zTotal, 1);
                    });
                }
            });
        });
    });
});
