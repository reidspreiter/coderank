import * as path from "path";

import * as v from "vscode";

import { Config, DEFAULT_CONFIG } from "../services";

import { AvailableFiles, WORKSPACE } from "./workspace";

export function getTestContext(): v.ExtensionContext {
    return {
        secrets: {
            _storage: {} as Record<string, string>,
            store: function (key: string, value: string): Thenable<void> {
                this._storage[key] = value;
                return Promise.resolve();
            },
            get: function (key: string): Thenable<string | undefined> {
                return Promise.resolve(this._storage[key]);
            },
        },
        globalStorageUri: {
            fsPath: WORKSPACE,
        },
    } as unknown as v.ExtensionContext;
}

export async function openTextDocument(file: AvailableFiles) {
    const documentUri = v.Uri.file(path.join(WORKSPACE, file));
    const document = await v.workspace.openTextDocument(documentUri);
    await v.window.showTextDocument(document);
}

export async function writeText(file: AvailableFiles, text: string) {
    await openTextDocument(file);
    const editor = v.window.activeTextEditor;

    if (!editor) {
        console.error("No active text editor");
        return;
    }

    await editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, text);
    });
}

export async function deleteTextBeforeCursor(numChars: number) {
    const editor = v.window.activeTextEditor;
    if (!editor) {
        console.error("No active text editor");
        return;
    }

    const pos = editor.selection.active;

    const newPos = Math.max(pos.character - numChars, 0);
    const start = new v.Position(pos.line, newPos);
    const range = new v.Range(start, pos);

    await editor.edit((editBuilder) => {
        editBuilder.delete(range);
    });
}

export function createConfig(config: Partial<Config> = {}): Config {
    return {
        ...DEFAULT_CONFIG,
        ...config,
    };
}
