import path from "path";

import { window, OutputChannel, TextDocumentChangeEvent } from "vscode";

import { BufferParseStatus } from "../coderank";
import { getTimestamp } from "../util";

export type LogVerbosity = "" | "v" | "vv";

export class Logger {
    private static logger: Logger;
    private outputChannel: OutputChannel;
    private _verbosity: LogVerbosity;
    private label: string | null = null;

    private constructor(verbosity: LogVerbosity = "") {
        this.outputChannel = window.createOutputChannel("Coderank");
        this._verbosity = verbosity;
        this.log("Coderank has been activated");
    }

    static getLogger(verbosity?: LogVerbosity): Logger {
        if (!Logger.logger) {
            Logger.logger = new Logger(verbosity);
        }

        if (verbosity !== undefined) {
            Logger.logger.verbosity = verbosity;
        }
        return Logger.logger;
    }

    set verbosity(verbosity: LogVerbosity) {
        this._verbosity = verbosity;
        if (verbosity) {
            this.outputChannel.show();
        }
    }

    log(message: string, indent: number = 0) {
        if (!this._verbosity) {
            return;
        }
        if (this.label === null) {
            this.outputChannel.appendLine(`[${getTimestamp()}]${" ".repeat(indent + 2)}${message}`);
        } else {
            this.outputChannel.appendLine(`[${this.label}]${" ".repeat(indent + 2)}${message}`);
        }
    }

    logTextDocumentChange(event: TextDocumentChangeEvent, status: BufferParseStatus): void {
        if (!this._verbosity) {
            return;
        }

        this.label = getTimestamp();
        const filename = path.basename(event.document.fileName);
        const scheme = event.document.uri.scheme;

        if (this._verbosity === "v") {
            event.contentChanges.forEach((change, index) => {
                const added = change.text.length;
                const deleted = change.rangeLength;
                if (added > 1 || deleted > 1) {
                    let rejectedMessage = "";
                    if (contentChanges.length === 0) {
                        rejectedMessage = "REJECTED: no content changes";
                    } else if (scheme !== "file") {
                        (rejectedMessage = "REJECTED: scheme is not 'file'"), 2;
                    } else if (filename === "COMMIT_EDITMSG") {
                        (rejectedMessage = "REJECTED: editing 'COMMITEDIT_MSG"), 2;
                    } else if (filename === "git-rebase-todo") {
                        (rejectedMessage = "REJECTED: editing 'git-rebase-todo'"), 2;
                    } else if (status === "conflict") {
                        (rejectedMessage = "REJECTED: resolving merge conflict"), 2;
                    } else if (status === "git") {
                        const change = event.contentChanges[0];
                        if (change.text.length === 0) {
                            if (change.rangeLength !== 1) {
                                rejectedMessage = "REJECTED: performing git operations";
                            }
                        } else {
                            const { start, end } = change.range;
                            if (
                                end.line - start.line !== 0 ||
                                end.character - start.character !== 0
                            ) {
                                rejectedMessage = "REJECTED: performing git operations";
                            }
                        }
                    } else {
                        const change = event.contentChanges[0];
                        const conflictRegex = /<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> .*?/s;
                        if (change.text.match(conflictRegex)) {
                            rejectedMessage = "REJECTED: resolving merge conflict";
                        } else if (change.text.length) {
                            const { start, end } = change.range;
                            if (
                                end.line - start.line !== 0 ||
                                end.character - start.character !== 0
                            ) {
                                rejectedMessage =
                                    "REJECTED: invalid paste with non-zero range difference";
                            }
                        }
                    }
                    this.log(
                        `${filename}::${scheme} -> added ${added}, deleted ${deleted}${rejectedMessage !== "" ? ", " + rejectedMessage : ""}`
                    );
                }
            });
            return;
        }

        this.log("<<< Text Document Change Event >>>");
        this.log(`name: ${filename}`, 2);
        this.log(`path: ${event.document.fileName}`, 2);
        this.log("");

        const contentChanges = event.contentChanges;

        this.log(`scheme: ${scheme}`, 2);
        this.log(`status: ${status}`, 2);
        this.log(`changes: ${contentChanges.length}`, 2);

        contentChanges.forEach((change, index) => {
            this.log("");
            this.log(`change ${index + 1} {`, 2);
            const { start, end } = change.range;
            this.log(`range: ${start.line}:${start.character} -> ${end.line}:${end.character}`, 4);
            this.log(`deleted: ${change.rangeLength}`, 4);
            if (change.text.length !== 0) {
                this.log(`added: ${change.text.length} (`, 4);
                change.text.split("\n").forEach((line) => this.log(line, 6));
                this.log(")", 4);
            } else {
                this.log(`added: ${change.text.length}`, 4);
            }

            this.log(`}`, 2);
            this.log("");
        });

        if (contentChanges.length === 0) {
            this.log("REJECTED: no content changes", 2);
        } else if (scheme !== "file") {
            if (status !== "git" && scheme === "git") {
                this.log("New status: 'git'", 2);
            }
            this.log("REJECTED: scheme is not 'file'", 2);
        } else if (filename === "COMMIT_EDITMSG") {
            this.log("REJECTED: editing 'COMMITEDIT_MSG", 2);
        } else if (filename === "git-rebase-todo") {
            this.log("REJECTED: editing 'git-rebase-todo'", 2);
        } else if (status === "conflict") {
            this.log("REJECTED: resolving merge conflict", 2);
        } else if (status === "git") {
            const change = event.contentChanges[0];
            if (change.text.length === 0) {
                if (change.rangeLength !== 1) {
                    this.log("REJECTED: performing git operations", 2);
                } else {
                    this.log("New status: 'normal'", 2);
                    this.log("ACCEPTED", 2);
                }
            } else {
                const { start, end } = change.range;
                if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                    this.log("REJECTED: performing git operations", 2);
                } else {
                    this.log("New status: 'normal'", 2);
                    this.log("ACCEPTED", 2);
                }
            }
        } else {
            const change = event.contentChanges[0];
            const conflictRegex = /<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> .*?/s;
            if (change.text.match(conflictRegex)) {
                this.log("New status: 'conflict'", 2);
                this.log("REJECTED: resolving merge conflict");
            } else if (change.text.length) {
                const { start, end } = change.range;
                if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                    this.log("REJECTED: invalid paste with non-zero range difference", 2);
                } else {
                    this.log("ACCEPTED", 2);
                }
            } else {
                this.log("ACCEPTED", 2);
            }

            this.log("<<< End Event >>>");
            this.label = null;
            this.log("");
        }
    }
}
