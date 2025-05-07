import * as assert from "assert";
import * as path from "path";

import { before } from "mocha";
import * as v from "vscode";

import { Coderank } from "../../coderank/coderank.js";
import { openTextDocument, getTestContext } from "../util.js";

suite("Test extension", () => {
    const context = getTestContext();
    let coderank: Coderank;

    before(async () => {
        coderank = await Coderank.init(context);
    });

    test("Active text editor change", async () => {
        v.window.onDidChangeActiveTextEditor((editor) => {
            coderank.buffer.updateLanguage(editor);
        });

        await openTextDocument("test.txt");
        assert.strictEqual(coderank.buffer.language, "plaintext");

        await openTextDocument("test.js");
        assert.strictEqual(coderank.buffer.language, "javascript");
    });
});
