import { ExtensionContext, window, workspace, commands } from 'vscode';
import { charSortQuickPick as sortCharDataQuickPick } from './characters';
import { Config } from './config';
import { Stats } from './stats';
import { CoderankStatsProvider } from './provider';

const RANK_SIZE = 100000;

export function activate(context: ExtensionContext) {

	let stats = new Stats();
	let config = new Config();
	const provider = new CoderankStatsProvider(config, stats);
	window.registerTreeDataProvider("coderank", provider);

	context.subscriptions.push(workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("coderank")) {
			config = new Config();
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

		let additions = 0;
		let deletions = 0;
		for (const change of event.contentChanges) {
			const {text, rangeLength} = change;

			// if rangeLength is not 0, a mass content deletion the size of rangeLength occured
			if (rangeLength) {
				deletions += rangeLength;
			} else {
				additions += text.length;
				if (config.trackCharacters) {
					stats.project.charData.inputData(text);
				}
			}
		}

		stats.project.total += additions - deletions;
		stats.project.added += additions;
		stats.project.deleted += deletions;
		stats.project.rankBuffer++;
		countSinceLastRefresh += additions + deletions;
		countSinceLastCharacterRefresh += additions + deletions;

		if (countSinceLastRefresh >= config.refreshRate) {
			countSinceLastRefresh = 0;
			if (stats.project.rankBuffer >= RANK_SIZE) {
				stats.project.rankBuffer -= RANK_SIZE;
				stats.project.rank++;
			}
			provider.refreshProjectStats({...stats.project});
		}

		if (countSinceLastCharacterRefresh >= config.charRefreshRate) {
			countSinceLastCharacterRefresh = 0;
			if (config.trackCharacters) {
				provider.refreshCharacterData(stats.project.charData);
			}
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.refreshProject", () => {
		countSinceLastCharacterRefresh = 0;
		countSinceLastRefresh = 0;
		if (config.trackCharacters) {
			provider.refreshProjectStats({...stats.project}, stats.project.charData);
		} else {
			provider.refreshProjectStats({...stats.project});
		}
	}));

	context.subscriptions.push(commands.registerCommand("coderank.sortCharacterData", async () => {
		const sortOrder = await sortCharDataQuickPick();
		if (sortOrder) {
			stats.sortCharData(sortOrder);
			provider.refresh();
		}
	}));
}

export function deactivate() {}
