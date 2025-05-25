import * as assert from "assert";

import { beforeEach, afterEach } from "mocha";
import sinon from "sinon";
import * as v from "vscode";

import { Git } from "../../services/index.js";
import { getTestContext } from "../util.js";

suite("Test services", () => {
    const context = getTestContext();

    suite("Test `Git`", () => {
        const username = "testUser";
        const pat = "testPAT";
        const repo = "testRepo";

        afterEach(() => {
            sinon.restore();
        });

        const mockInputs = (first: any = username, second: any = pat, third: any = repo) => {
            const showInputBoxStub = sinon.stub(v.window, "showInputBox");
            showInputBoxStub
                .onFirstCall()
                .resolves(first)
                .onSecondCall()
                .resolves(second)
                .onThirdCall()
                .resolves(third);
        };

        suite("Test `loginContext`", () => {
            beforeEach(() => {
                sinon.stub(Git.prototype, "pushRepo");
                sinon.stub(Git.prototype, "cloneRepo");
            });

            test("Synchronous callback", async () => {
                mockInputs();
                const saveCredentialsStub = sinon.stub(Git.prototype, "saveCredentials");
                const callback = sinon.spy((repoDir: string) => {
                    return true;
                });
                await Git.loginCloneContext(context, callback, { saveCredentials: false });
                sinon.assert.calledOnce(callback);
                sinon.assert.notCalled(saveCredentialsStub);
            });

            test("Asynchronous callback", async () => {
                mockInputs();
                const saveCredentialsStub = sinon.stub(Git.prototype, "saveCredentials");
                const callback = sinon.spy(async (repoDir: string) => {
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    return true;
                });
                await Git.loginCloneContext(context, callback, { saveCredentials: false });
                sinon.assert.calledOnce(callback);
                sinon.assert.notCalled(saveCredentialsStub);
            });

            test("Save credentials", async () => {
                mockInputs();
                await Git.loginCloneContext(
                    context,
                    () => {
                        return true;
                    },
                    { saveCredentials: true }
                );
                assert.strictEqual(await context.secrets.get("githubUser"), username);
                assert.strictEqual(await context.secrets.get("githubPAT"), pat);
                assert.strictEqual(await context.secrets.get("githubRepo"), repo);
            });

            test("No execution on unsuccessful login", async () => {
                const saveCredentialsStub = sinon.stub(Git.prototype, "saveCredentials");
                mockInputs(null);
                const callback = sinon.spy((repoDir: string) => {
                    return true;
                });
                await Git.loginCloneContext(context, callback, { saveCredentials: false });
                sinon.assert.notCalled(callback);
                sinon.assert.notCalled(saveCredentialsStub);
            });
        });
    });
});
