import { ExtensionContext, window, workspace, commands } from 'vscode';
import { charSortQuickPick as sortCharDataQuickPick } from './characters';
import { getConfig } from './config';
import { Stats } from './stats';
import { CoderankStatsProvider } from './provider';

const RANK_SIZE = 100000;

export function activate(context: ExtensionContext) {

	let config = getConfig();
	let stats = new Stats(config.characterSortOrder);
	const provider = new CoderankStatsProvider(config, stats);
	window.registerTreeDataProvider("coderank", provider);

	context.subscriptions.push(workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("coderank")) {
			config = getConfig();
			provider.setData(config, stats);
			provider.refresh();
		}
	}));

	// Use counter instead of modulo to avoid clamping the buffer to be divisible by the refresh rate.
	// If the user manually refreshes, refresh x characters from that point.
	let countSinceLastRefresh = 0;
	let countSinceLastCharacterRefresh = 0;
	context.subscriptions.push(workspace.onDidChangeTextDocument((event) => {
		// Do not track non-code events like saving the document
		if (!event.contentChanges) {
			return;
		}

		for (const change of event.contentChanges) {
			const {text, rangeLength} = change;
			const length = rangeLength ? rangeLength : text.length;

			// if rangeLength is not 0, a mass content deletion the size of rangeLength occured
			if (rangeLength) {
				stats.project.deleted += length;
			} else {
				stats.project.added += length;

				if (config.trackCharacters) {
					stats.project.charData.input(text);
				}
			}
			countSinceLastRefresh += length;
			countSinceLastCharacterRefresh += length;
		}

		stats.project.total = stats.project.added - stats.project.deleted;
		stats.project.rankBuffer++;

		if (countSinceLastRefresh >= config.refreshRate) {
			countSinceLastRefresh = 0;
			if (stats.project.rankBuffer >= RANK_SIZE) {
				stats.project.rankBuffer -= RANK_SIZE;
				stats.project.rank++;
			}
			provider.setFields(stats.project, "project");
		}

		if (countSinceLastCharacterRefresh >= config.charRefreshRate) {
			countSinceLastCharacterRefresh = 0;
			if (config.trackCharacters) {
				provider.setFields(stats.project, "project", "refreshCharDataOnly");
			}
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.refreshProject", () => {
		countSinceLastCharacterRefresh = 0;
		countSinceLastRefresh = 0;
		if (config.trackCharacters) {
			provider.setFields(stats.project, "project", "refreshCharDataOnly");
		} else {
			provider.setFields(stats.project, "project");
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.sortCharacterData", async () => {
		if (config.trackCharacters) {
			const sortOrder = await sortCharDataQuickPick();
			if (sortOrder) {
				stats.sortCharData(sortOrder);
				provider.refreshAllCharData(stats);
			}
		} else {
			window.showErrorMessage("'coderank.trackCharacters' is disabled. There are no characters to sort");
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.loadLocalValues", async () => {
		try {
			await stats.loadLocal(context);
			console.log(stats);
			provider.setData(config, stats);
			provider.refresh();
		} catch (err) {
			console.error(err);
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.storeProjectValues", async () => {
		await stats.storeProjectInLocal(context);
		provider.setData(config, stats);
		provider.refresh();
	}));
}

export function deactivate() {}
