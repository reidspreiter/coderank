import * as path from "path";

import * as v from "vscode";

import * as s from "../schemas";
import { Logger } from "../services";
import { getWeek, getYear } from "../util";
import { RANK_INCREMENT } from "../util";

const LOG = Logger.getLogger();
const CONFLICT_REGEX = /<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> .*?/s;

export type BufferParseStatus = "normal" | "git" | "conflict";

export class Buffer {
    private constructor(
        private _week: string,
        private _year: string,
        private _language: string = "unknown",
        private _machine: string = "unknown",
        private parseStatus: BufferParseStatus = "normal",
        private _data: s.CoderankBuffer = s.CoderankBufferSchema.parse({})
    ) {}

    static init(): Buffer {
        const week = getWeek();
        const year = getYear();
        const buffer = new Buffer(week, year);
        buffer.updateLanguage(v.window.activeTextEditor);
        return buffer;
    }

    get data(): s.CoderankBuffer {
        return this._data;
    }

    get language(): string {
        return this._language;
    }

    get week(): string {
        return this._week;
    }

    get year(): string {
        return this._year;
    }

    get machine(): string {
        return this._machine;
    }

    clear() {
        this._data = s.CoderankBufferSchema.parse({});
    }

    parseTextDocumentChangeEvent(event: v.TextDocumentChangeEvent) {
        const scheme = event.document.uri.scheme;
        if (scheme === "output") {
            // logger scheme is "output", do this to avoid endless loop
            return;
        }

        LOG.logTextDocumentChange(event, this.parseStatus);

        // Do not track non-code events like saving the document or console output
        const filename = path.basename(event.document.fileName);
        if (event.contentChanges.length === 0 || scheme !== "file") {
            if (scheme === "git") {
                this.parseStatus = "git";
            }
            return;
        }

        if (filename === "COMMIT_EDITMSG" || filename === "git-rebase-todo") {
            this.parseStatus = "git";
            return;
        }

        if (this.parseStatus === "conflict") {
            return;
        } else if (this.parseStatus === "git") {
            // To completely avoid tracking git events,
            // do not resume normal behavior until the user types or deletes an individual character
            const change = event.contentChanges[0];
            if (change.text.length === 0) {
                if (change.rangeLength !== 1) {
                    return;
                }
            } else {
                const { start, end } = change.range;
                if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                    return;
                }
            }
            this.parseStatus = "normal";
        }

        const changes = event.contentChanges.length;
        const change = event.contentChanges[0];

        // rangeLength tracks the amount of deleted characters
        const length = change.text.length || change.rangeLength;

        if (change.text.length) {
            if (change.text.match(CONFLICT_REGEX)) {
                this.parseStatus = "conflict";
                return;
            }
            const { start, end } = change.range;
            if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                return;
            }
            this.handleAddition(length * changes, change.text.repeat(changes));
        } else {
            this.handleDeletion(length * changes);
        }
    }

    private handleDeletion(deleted: number): void {
        if (!(this._language in this._data.languages)) {
            this._data.languages[this._language] = s.MainStatsSchema.parse({});
        }
        const language = this._data.languages[this._language];

        language.deleted += deleted;
        language.rank += RANK_INCREMENT;

        if (deleted > 1) {
            language.deleted_cut += deleted;
            language.num_cuts++;
        } else {
            language.deleted_typed++;
        }
    }

    private handleAddition(added: number, chars: string): void {
        if (!(this._language in this._data.languages)) {
            this._data.languages[this._language] = s.MainStatsSchema.parse({});
        }
        const language = this._data.languages[this._language];

        language.added += added;
        language.rank += RANK_INCREMENT;
        language.chars = s.parseStringToCharMap(chars, language.chars);

        if (added > 1) {
            language.added_pasted += added;
            language.num_pastes++;
        } else {
            language.added_typed++;
        }
    }

    updateLanguage(editor: v.TextEditor | undefined): void {
        let language = "unknown";
        if (editor) {
            language = editor.document.languageId;
        }
        LOG.log(`Detected new language: ${language}`);
        this._language = language;
    }
}
