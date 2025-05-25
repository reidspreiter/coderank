import { promises as fs } from "fs";
import path from "path";

import { beforeEach, afterEach } from "mocha";
import sinon from "sinon";

import { Coderank } from "../../coderank/coderank.js";
import * as s from "../../schemas";
import { AUTOPUSH_RECORD_FILENAME } from "../../util.js";
import { getTestContext, createConfig } from "../util.js";

suite("Test extension", () => {
    const context = getTestContext();
    let coderank: Coderank;

    beforeEach(async () => {
        coderank = await Coderank.init(context);
    });

    suite("Test push reminders", () => {
        // readJSONFile is non-configurable / non-writeable to sinon so do this horrible workaround
        const autoPushRecordFilePath = path.join(
            context.globalStorageUri.fsPath,
            AUTOPUSH_RECORD_FILENAME
        );
        let flushLocalToRemoteStub: sinon.SinonStub;

        beforeEach(async () => {
            await fs.writeFile(
                autoPushRecordFilePath,
                s.stringify(
                    s.AutoPushRecordSchema.parse({
                        year: "2025",
                        month: "02",
                        week: "7",
                        day: "20",
                    })
                ),
                "utf-8"
            );
            flushLocalToRemoteStub = sinon.stub(coderank, "pushLocalToRemote");
        });

        afterEach(async () => {
            sinon.restore();
            await fs.rm(autoPushRecordFilePath);
        });

        test("Auto push when due weekly", async () => {
            await coderank.autoPush(
                context,
                createConfig({ pushReminderFrequency: "weekly-force" })
            );
            sinon.assert.calledOnce(flushLocalToRemoteStub);
        });

        test("Auto push when due daily", async () => {
            await coderank.autoPush(
                context,
                createConfig({ pushReminderFrequency: "daily-force" })
            );
            sinon.assert.calledOnce(flushLocalToRemoteStub);
        });

        test("Does not push when not due", async () => {
            await fs.writeFile(
                autoPushRecordFilePath,
                s.stringify(s.getCurrentAutoPushRecord()),
                "utf-8"
            );
            await coderank.autoPush(context, createConfig());
            sinon.assert.notCalled(flushLocalToRemoteStub);
        });
    });
});
