//
// If this page is customized, set `coderank.autoUpdateWebViewer`
// to `false` to prevent changes from being overwritten.
//
// Web viewer updates can be found here: https://github.com/reidspreiter/coderank
//

const SUPPORTED_VERSIONS = ["0.4.0"];
const SUPPORTED_EDITORS = ["VS Code"];
const POSSIBLE_LANGUAGE_VALUES = [
    "rank",
    "added",
    "added typed",
    "added pasted",
    "num pastes",
    "deleted",
    "deleted typed",
    "deleted cut",
    "num cuts",
    "net",
    "net typed",
    "net pasted cut",
    "net pastes and cuts",
    "total",
    "total typed",
    "total pasted cut",
    "total pastes and cuts",
];
const POSSIBLE_CHARACTER_VALUES = ["added", "added typed", "added pasted"];

Chart.defaults.color = "#F5F5F5";
Chart.defaults.font.family = "monospace";
chartColors = [
    "#469bbc",
    "#8bc8d3",
    "#6bb65d",
    "#bcde85",
    "#e18731",
    "#f5ac91",
    "#ab6cc5",
    "#b4ace3",
    "#df5d99",
    "#dea1d1",
    "#4baa9f",
    "#96d1b4",
    "#ee7447",
    "#f4a3a0",
];

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const coderankData = await loadCoderankData();
        initializeStatsTable(coderankData);
        initializeLangChart(coderankData);
        initializeCharChart(coderankData);
        removeLoader();
    } catch (err) {
        showAlertModal(
            `Encountered an error while initializing Coderank web viewer:\n\n${err.stack}`
        );
        throw err;
    }
});

const loadCoderankData = async () => {
    const coderankFilename = "coderank.json";
    try {
        const response = await fetch(`./coderank/${coderankFilename}`);
        if (!response.ok) {
            throw new Error(`Something went wrong: ${response.status} - ${response.statusText}`);
        }
        const json = await response.json();
        if (!SUPPORTED_VERSIONS.includes(json.version)) {
            showAlertModal(
                `Unsupported schema version '${json.version}' detected for '${coderankFilename}' file. Expected ${SUPPORTED_VERSIONS}.\n\nThis may cause issues.\n\nPlease update your Coderank web viewer. If you have already updated your web viewer, please submit a bug report below:`
            );
        }
        return json;
    } catch (err) {
        showAlertModal(`Error fetching '${coderankFilename}':\n\n${err.stack}`);
    }
};

const showAlertModal = (message) => {
    let modalMessage = document.getElementById("modal-message");
    modalMessage.innerText += modalMessage.innerText === "" ? message : `\n\n${message}`;
    document.getElementById("modal-message").innerText += message;
    document.getElementById("modal").style.display = "block";
};

const closeAlertModal = () => {
    document.getElementById("modal").style.display = "none";
    document.getElementById("modal-message").innerText = "";
};

const removeLoader = () => {
    document.getElementById("app").style.display = "flex";
    document.getElementById("loader").remove();
};

//
// Helpers
//

const getMostRecentWeek = (weeks) => {
    let mostRecent = weeks[0];

    for (let i = 1; i < weeks.length; i++) {
        const a = mostRecent;
        const b = weeks[i];
        if (b === "0") {
            mostRecent = 0;
        } else {
            mostRecent = Number(b) > Number(a) ? b : a;
        }
    }
    return mostRecent;
};

const getLatestYears = (years, maxCount = 5) => {
    return years
        .map((str) => ({ str, num: Number(str) }))
        .sort((a, b) => b.num - a.num)
        .slice(0, Math.min(maxCount, years.length))
        .map((item) => item.str);
};

const getISOWeek = (week, year) => {
    const day = 1 + (week - 1) * 7;
    const start = new Date(year, 0, day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", fmt)} - ${end.toLocaleDateString("en-US", fmt)}`;
};

const getActiveWeeks = (data) => {
    return data.weeks.reduce((wks, entry) => {
        if (entry.added > 0 || entry.deleted > 0) {
            wks.push(entry.week);
        }
        return wks;
    }, []);
};

const fmtChar = (char) => {
    const map = {
        "\n": "\\n",
        "\t": "\\t",
        " ": " ",
    };
    return map[char] ? `'${map[char]}'` : char;
};

const fmtNum = (numOrStr, fractionDigits = 2) => {
    return Number(numOrStr).toLocaleString(undefined, {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
    });
};

const copy = (data) => {
    return JSON.parse(JSON.stringify(data));
};

//
// Schema helpers
//

const possibleCharacterValueToFieldName = (value) => {
    switch (value) {
        case "added typed":
            return "added_typed";
        case "added pasted":
            return "added_pasted";
        default:
            return value;
    }
};

const computeValueFromMainStats = (mainStats, value) => {
    switch (value) {
        case "rank":
            return mainStats.rank;
        case "added":
            return mainStats.added;
        case "added typed":
            return mainStats.added_typed;
        case "added pasted":
            return mainStats.added_pasted;
        case "num pastes":
            return mainStats.num_pastes;
        case "deleted":
            return mainStats.deleted;
        case "deleted typed":
            return mainStats.deleted_typed;
        case "deleted cut":
            return mainStats.deleted_cut;
        case "num cuts":
            return mainStats.num_cuts;
        case "net":
            return mainStats.added - mainStats.deleted;
        case "net typed":
            return mainStats.added_typed - mainStats.deleted_typed;
        case "net pasted cut":
            return mainStats.added_pasted - mainStats.deleted_cut;
        case "net pastes and cuts":
            return mainStats.num_pastes - mainStats.num_cuts;
        case "total":
            return mainStats.added + mainStats.deleted;
        case "total typed":
            return mainStats.added_typed + mainStats.deleted_typed;
        case "total pasted cut":
            return mainStats.added_pasted + mainStats.deleted_cut;
        case "total pastes and cuts":
            return mainStats.num_pastes + mainStats.num_cuts;
        default:
            return mainStats.added;
    }
};

const sumCharMaps = (base, addend) => {
    for (const char in addend) {
        const stats = addend[char];
        const entry = base[char] || {
            added: 0,
            added_typed: 0,
            added_pasted: 0,
        };
        entry.added += stats.added;
        entry.added_typed += stats.added_typed;
        entry.added_pasted += stats.added_pasted;
        base[char] = entry;
    }
    return base;
};

const sumMainStats = (base, addend) => {
    base.rank += addend.rank;
    base.added += addend.added;
    base.added_pasted += addend.added_pasted;
    base.added_typed += addend.added_typed;
    base.num_pastes += addend.num_pastes;
    base.deleted += addend.deleted;
    base.deleted_typed += addend.deleted_typed;
    base.deleted_cut += addend.deleted_cut;
    base.num_cuts += addend.num_cuts;
    base.chars = sumCharMaps(base.chars, addend.chars);
    return base;
};

const sumLangMaps = (base, addend) => {
    for (const lang in addend) {
        base[lang] = sumMainStats(
            base[lang] || {
                rank: 0,
                added: 0,
                added_typed: 0,
                added_pasted: 0,
                num_pastes: 0,
                deleted: 0,
                deleted_typed: 0,
                deleted_cut: 0,
                num_cuts: 0,
                chars: {},
            },
            addend[lang]
        );
    }
    return base;
};

const sumCoderankBuffers = (base, addend) => {
    base.languages = sumLangMaps(base.languages, addend.languages);
    return base;
};

const sumEditorMaps = (base, addend) => {
    for (const key in addend) {
        base[key] = sumCoderankBuffers(
            base[key] || {
                languages: {},
            },
            addend[key]
        );
    }
    return base;
};

const sumMachineMaps = (base, addend) => {
    for (const key in addend) {
        if (!base[key]) {
            base[key] = {
                name: addend[key].name,
                editors: {},
            };
        }
        base[key].editors = sumEditorMaps(
            base[key].editors || {
                languages: {},
            },
            addend[key].editors
        );
    }
    return base;
};

const sumCoderankStats = (base, addend) => {
    base.machines = sumMachineMaps(base.machines, addend.machines);
    return base;
};

const getDesiredKeys = (data, keys = undefined) => {
    return Array.isArray(keys) ? keys : keys !== undefined ? [keys] : Object.keys(data);
};

const sumDurationData = (data, keys = undefined) => {
    const dataCopy = copy(data);
    const desiredKeys = getDesiredKeys(data, keys);

    let base = dataCopy[desiredKeys[0]];
    for (let i = 1; i < desiredKeys.length; i++) {
        base = sumCoderankStats(base, dataCopy[desiredKeys[i]]);
    }
    return base;
};

const getMachineMapInDuration = (data, keys = undefined) => {
    const machineMap = new Map([["all", "all"]]);
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        for (const machine in data[key].machines) {
            if (!machineMap.has(machine)) {
                machineMap.set(machine, data[key].machines[machine].name);
            }
        }
    }
    return machineMap;
};

const getEditorsInDuration = (data, keys = undefined, machine) => {
    const editors = new Set(["all"]);
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        const machines =
            machine === "all" ? Object.values(data[key].machines) : [data[key].machines[machine]];
        for (const machineData of machines) {
            for (const editor in machineData.editors) {
                editors.add(editor);
            }
        }
    }
    return [...editors];
};

const getLanguagesInDuration = (data, keys = undefined, machine, editor) => {
    const languages = new Set(["all"]);
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        const machines =
            machine === "all" ? Object.values(data[key].machines) : [data[key].machines[machine]];
        for (const machineData of machines) {
            const editors =
                editor === "all"
                    ? Object.values(machineData.editors)
                    : [machineData.editors[editor]];
            for (const editorData of editors) {
                for (const language in editorData.languages) {
                    languages.add(language);
                }
            }
        }
    }
    return [...languages];
};

const getLanguageDataInDuration = (data, keys = undefined, machine = "all", editor = "all") => {
    let languages = undefined;
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        const machines =
            machine === "all" ? Object.values(data[key].machines) : [data[key].machines[machine]];
        for (const machineData of machines) {
            const editors =
                editor === "all"
                    ? Object.values(machineData.editors)
                    : [machineData.editors[editor]];
            for (const editorData of editors) {
                languages =
                    languages === undefined
                        ? copy(editorData.languages)
                        : sumLangMaps(languages, editorData.languages);
            }
        }
    }
    return languages;
};

const getCharactersMapInDuration = (data, keys = undefined, machine, editor, language) => {
    const characterMap = new Map([["all", "all"]]);
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        const machines =
            machine === "all" ? Object.values(data[key].machines) : [data[key].machines[machine]];
        for (const machineData of machines) {
            const editors =
                editor === "all"
                    ? Object.values(machineData.editors)
                    : [machineData.editors[editor]];
            for (const editorData of editors) {
                const languages =
                    language === "all"
                        ? Object.values(editorData.languages)
                        : [editorData.languages[language]];
                for (const languageData of languages) {
                    for (const character in languageData.chars) {
                        if (!characterMap.has(character)) {
                            characterMap.set(character, fmtChar(character));
                        }
                    }
                }
            }
        }
    }
    return characterMap;
};

const getCharactersDataInDuration = (
    data,
    keys = undefined,
    machine = "all",
    editor = "all",
    language = "all"
) => {
    let characters = undefined;
    const desiredKeys = getDesiredKeys(data, keys);

    for (const key of desiredKeys) {
        const machines =
            machine === "all" ? Object.values(data[key].machines) : [data[key].machines[machine]];
        for (const machineData of machines) {
            const editors =
                editor === "all"
                    ? Object.values(machineData.editors)
                    : [machineData.editors[editor]];
            for (const editorData of editors) {
                const languages =
                    language === "all"
                        ? Object.values(editorData.languages)
                        : [editorData.languages[language]];
                for (const languageData of languages) {
                    characters =
                        characters === undefined
                            ? copy(languageData.chars)
                            : sumCharMaps(characters, languageData.chars);
                }
            }
        }
    }
    return characters;
};

const sumTotalMainStatsAndTypingActionsForLanguagesEditorsMachines = (data) => {
    let base = {
        rank: 0,
        added: 0,
        added_typed: 0,
        added_pasted: 0,
        num_pastes: 0,
        deleted: 0,
        deleted_typed: 0,
        deleted_cut: 0,
        num_cuts: 0,
        chars: {},
    };
    const machineMap = new Map();
    const editorMap = new Map();
    const languageMap = new Map();

    for (const machine in data.machines) {
        const machineData = data.machines[machine];
        for (const editor in machineData.editors) {
            const editorData = machineData.editors[editor];
            for (const language in editorData.languages) {
                base = sumMainStats(base, copy(editorData.languages[language]));

                const rank = editorData.languages[language].rank;
                languageMap[language] = (languageMap[language] ?? 0) + rank;
                editorMap[editor] = (editorMap[editor] ?? 0) + rank;

                if (!machineMap[machine]) {
                    machineMap[machine] = { name: machineData.name, rank };
                } else {
                    machineMap[machine].rank += rank;
                }
            }
        }
    }
    return [base, languageMap, editorMap, machineMap];
};

const sumChars = (base, addend) => {
    for (const [key, val] of Object.entries(addend)) {
        base[key] = (base[key] ?? 0) + val;
    }
    return base;
};

//
// Selectors
//

const LISTENERS = new Map();
const buildSelect = (
    id,
    options,
    { optionText = null, onChange = null, currValue = null } = {}
) => {
    const select = document.getElementById(id);
    select.innerHTML = "";

    if (onChange !== null) {
        if (LISTENERS.has(id)) {
            select.removeEventListener("change", LISTENERS.get(id));
        }
        select.addEventListener("change", onChange);
        LISTENERS.set(id, onChange);
    }

    for (let i = 0; i < options.length; i++) {
        const optionElem = document.createElement("option");
        optionElem.value = options[i];
        optionElem.text = optionText ? optionText[i] : optionElem.value;
        select.appendChild(optionElem);
    }

    selectVal(id, currValue !== null && options.includes(currValue) ? currValue : options[0]);
};

const selectVal = (id, option) => {
    const selectElement = document.getElementById(id);
    selectElement.value = option;
    const event = new Event("change");
    selectElement.dispatchEvent(event);
};

const buildDurationSelect = (id, coderankData, onChange) => {
    const [durationKeys, durationVals] = getDurationKeyVals(coderankData);

    buildSelect(id, durationKeys, {
        optionText: durationVals,
        onChange,
    });
};

const buildMachineSelect = (id, coderankData, duration, currValue, onChange) => {
    const machines = getMachineMapInDuration(...getDataAndKeysFromDuration(coderankData, duration));

    buildSelect(id, Array.from(machines.keys()), {
        optionText: Array.from(machines.values()),
        onChange,
        currValue,
    });
};

const buildEditorSelect = (id, coderankData, duration, machine, currValue, onChange) => {
    const editors = getEditorsInDuration(
        ...getDataAndKeysFromDuration(coderankData, duration),
        machine
    );
    buildSelect(id, editors, { onChange, currValue });
};

const buildLanguageSelect = (id, coderankData, duration, machine, editor, currValue, onChange) => {
    const languages = getLanguagesInDuration(
        ...getDataAndKeysFromDuration(coderankData, duration),
        machine,
        editor
    );
    buildSelect(id, languages, { onChange, currValue });
};

const buildCharSelect = (
    id,
    coderankData,
    duration,
    machine,
    editor,
    language,
    currValue,
    onChange,
    value = "added"
) => {
    if (POSSIBLE_CHARACTER_VALUES.includes(value)) {
        const characters = getCharactersMapInDuration(
            ...getDataAndKeysFromDuration(coderankData, duration),
            machine,
            editor,
            language
        );
        buildSelect(id, Array.from(characters.keys()), {
            optionText: Array.from(characters.values()),
            onChange,
            currValue,
        });
    } else {
        buildSelect(id, ["n/a"]);
    }
};

const getDurationKeyVals = (coderankData) => {
    const weeks = Object.keys(coderankData.pastFiveWeeks);
    const years = Object.keys(coderankData.years);

    const latestYear = Math.max(...years);
    const keys = ["1 week", "5 weeks", "1 year"];
    if (years.length >= 5) {
        keys.push("5 years");
    }
    keys.push(...["all time", ...years]);
    const vals = [...keys];
    for (const week of weeks) {
        if (Object.keys(coderankData.pastFiveWeeks[week].machines).length !== 0) {
            keys.push(week);
            vals.push(getISOWeek(week, latestYear));
        }
    }
    return [keys, vals];
};

const getDataAndKeysFromDuration = (coderankData, duration) => {
    const years = Object.keys(coderankData.years);
    const weeks = Object.keys(coderankData.pastFiveWeeks);

    if (years.includes(duration)) {
        return [coderankData.years, duration];
    } else if (weeks.includes(duration)) {
        return [coderankData.pastFiveWeeks, duration];
    } else if (duration === "1 year") {
        return [coderankData.years, Math.max(...years)];
    } else if (duration === "1 week") {
        return [coderankData.pastFiveWeeks, getMostRecentWeek(weeks)];
    } else if (duration === "5 weeks") {
        return [coderankData.pastFiveWeeks, undefined];
    } else if (duration === "5 years") {
        return [coderankData.years, getLatestYears(years)];
    } else {
        return [coderankData.years, undefined];
    }
};

//
// Quick Stats
//

const buildAddDeleteNetTable = (id, map) => {
    const table = document.getElementById(id);
    table.innerHTML = "";

    const headers = ["", "added", "deleted", "total", "net"];
    const headerRow = document.createElement("tr");
    for (const value of headers) {
        const cell = document.createElement("th");
        cell.textContent = value;
        headerRow.appendChild(cell);
    }
    table.appendChild(headerRow);

    for (const [key, values] of map) {
        const row = document.createElement("tr");

        const keyCell = document.createElement("td");
        keyCell.textContent = key;
        keyCell.style.whiteSpace = "pre-line";
        row.appendChild(keyCell);

        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            cell.style.whiteSpace = "pre-line";
            cell.classList.add("right");
            row.appendChild(cell);
        }
        table.appendChild(row);
    }
};

const buildKeyValTable = (id, map) => {
    const table = document.getElementById(id);
    table.innerHTML = "";

    for (const [key, value] of map) {
        const row = document.createElement("tr");

        const keyCell = document.createElement("td");
        keyCell.textContent = key;
        keyCell.style.whiteSpace = "pre-line";
        keyCell.style.width = "30%";
        row.appendChild(keyCell);

        const valueCell = document.createElement("td");
        valueCell.textContent = value;
        valueCell.style.whiteSpace = "pre-line";
        row.appendChild(valueCell);

        table.appendChild(row);
    }
};

const populateStatsTable = (data) => {
    const [total, languageMap, editorMap, machineMap] =
        sumTotalMainStatsAndTypingActionsForLanguagesEditorsMachines(data);
    const baseStatsRows = new Map([
        [
            "rank",
            `${fmtNum(total.rank)}\n\n(${fmtNum(total.rank * 10000, 0)} individual text entry actions)`,
        ],
        [
            "characters\n(desc. added)",
            `${Object.entries(total.chars)
                .sort(([, a], [, b]) => b.added - a.added)
                .map(([char]) => fmtChar(char))
                .join(", ")} (${Object.keys(total.chars).length})`,
        ],
        [
            "languages\n(desc. typing actions)",
            `${Object.entries(languageMap)
                .sort(([, a], [, b]) => b - a)
                .map(([lang]) => lang)
                .join(", ")} (${Object.keys(languageMap).length})`,
        ],
        [
            "editors\n(desc. typing actions)",
            `${Object.entries(editorMap)
                .sort(([, a], [, b]) => b - a)
                .map(([editor]) => editor)
                .join(
                    ", "
                )} (${Object.keys(editorMap).length})\n\n[coderank supported editors: ${SUPPORTED_EDITORS.join(", ")}]`,
        ],
        [
            "machines\n(desc. typing actions)",
            `${Object.entries(machineMap)
                .sort(([, a], [, b]) => b.rank - a.rank)
                .map(([, entry]) => entry.name)
                .join(", ")} (${Object.keys(machineMap).length})`,
        ],
    ]);

    const addedDeleteNetRows = new Map([
        [
            "total",
            [
                fmtNum(total.added),
                fmtNum(total.deleted),
                fmtNum(total.added + total.deleted),
                fmtNum(total.added - total.deleted),
            ],
        ],
        [
            "typed",
            [
                fmtNum(total.added_typed),
                fmtNum(total.deleted_typed),
                fmtNum(total.added_typed + total.deleted_typed),
                fmtNum(total.added_typed - total.deleted_typed),
            ],
        ],
        [
            "pasted / cut",
            [
                fmtNum(total.added_pasted),
                fmtNum(total.deleted_cut),
                fmtNum(total.added_pasted + total.deleted_cut),
                fmtNum(total.added_pasted - total.deleted_cut),
            ],
        ],
        [
            "no. pastes / cuts",
            [
                fmtNum(total.num_pastes),
                fmtNum(total.num_cuts),
                fmtNum(total.num_pastes + total.num_cuts),
                fmtNum(total.num_pastes - total.num_cuts),
            ],
        ],
        [
            "ave. per paste / cut",
            [
                fmtNum(total.added_pasted / total.num_pastes),
                fmtNum(total.deleted_cut / total.num_cuts),
                fmtNum(1),
                fmtNum(1),
            ],
        ],
        [
            "ave. per rank",
            [
                fmtNum(total.added / total.rank),
                fmtNum(total.deleted / total.rank),
                fmtNum((total.added + total.deleted) / total.rank),
                fmtNum((total.added - total.deleted) / total.rank),
            ],
        ],
    ]);
    buildKeyValTable("base-stats-table", baseStatsRows);
    buildAddDeleteNetTable("add-delete-net-table", addedDeleteNetRows);
};

const initializeStatsTable = (coderankData) => {
    const durationSelect = document.getElementById("duration-select");

    const update = () => {
        populateStatsTable(
            sumDurationData(...getDataAndKeysFromDuration(coderankData, durationSelect.value))
        );
    };

    buildDurationSelect("duration-select", coderankData, () => {
        update();
    });
    selectVal("duration-select", "all time");
};

//
// Languages Chart
//

let langChart = null;
const populateLangChart = (langMap, value) => {
    const canvas = document.getElementById("lang-chart");
    const sortedLangMap = [...langMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sortedLangMap.map(([key]) => key);
    const data = sortedLangMap.map(([, value]) => value);

    if (langChart === null) {
        langChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: value,
                        data: data,
                        backgroundColor: chartColors,
                        borderColor: "#282828",
                        border: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                        },
                    },
                },
            },
        });
    } else {
        langChart.data.labels = labels;
        const dataset = langChart.data.datasets[0];
        dataset.data = data;
        dataset.label = value;
        langChart.update();
    }
};

const initializeLangChart = (coderankData) => {
    const durationSelect = document.getElementById("lang-duration-select");
    const valueSelect = document.getElementById("lang-value-select");
    const charSelect = document.getElementById("lang-char-select");
    const editorSelect = document.getElementById("lang-editor-select");
    const machineSelect = document.getElementById("lang-machine-select");

    const update = () => {
        const duration = durationSelect.value;
        const value = valueSelect.value;
        const char = charSelect.value;
        const editor = editorSelect.value || "all";
        const machine = machineSelect.value || "all";

        const languages = getLanguageDataInDuration(
            ...getDataAndKeysFromDuration(coderankData, duration),
            machine,
            editor
        );
        const langMap = new Map();

        if (char === "all" || char === "n/a") {
            for (const language in languages) {
                langMap.set(language, computeValueFromMainStats(languages[language], value));
            }
        } else {
            for (const language in languages) {
                const entry = languages[language];
                if (char in entry.chars) {
                    langMap.set(language, computeValueFromMainStats(entry.chars[char], value));
                }
            }
        }
        populateLangChart(langMap, value);
    };

    buildSelect("lang-value-select", POSSIBLE_LANGUAGE_VALUES, {
        onChange: () => {
            buildCharSelect(
                "lang-char-select",
                coderankData,
                durationSelect.value,
                machineSelect.value,
                editorSelect.value,
                "all",
                charSelect.value,
                () => {
                    update();
                },
                valueSelect.value ?? "added"
            );
            update();
        },
    });

    buildDurationSelect("lang-duration-select", coderankData, () => {
        const duration = durationSelect.value;
        buildMachineSelect(
            "lang-machine-select",
            coderankData,
            duration,
            machineSelect.value,
            () => {
                const machine = machineSelect.value;
                buildEditorSelect(
                    "lang-editor-select",
                    coderankData,
                    duration,
                    machine,
                    editorSelect.value,
                    () => {
                        buildCharSelect(
                            "lang-char-select",
                            coderankData,
                            duration,
                            machine,
                            editorSelect.value,
                            "all",
                            charSelect.value,
                            () => {
                                update();
                            },
                            valueSelect.value
                        );
                        update();
                    }
                );
                update();
            }
        );
        update();
    });
    selectVal("lang-duration-select", "all time");
    selectVal("lang-value-select", "added");
};

//
// Characters Chart
//

let charChart = null;
const populateCharChart = (chars, order, orderVal) => {
    const canvas = document.getElementById("char-chart");
    const field = possibleCharacterValueToFieldName(orderVal);
    const characters = [];
    const amounts = [];
    let compareFunction;
    if (orderVal === "char") {
        compareFunction =
            order === "asc."
                ? (a, b) => a[0].localeCompare(b[0])
                : (a, b) => b[0].localeCompare(a[0]);
    } else {
        compareFunction =
            order === "asc."
                ? (a, b) => a[1][field] - b[1][field]
                : (a, b) => b[1][field] - a[1][field];
    }
    const keyvals = Object.entries(chars).sort(compareFunction);
    for (const keyval of keyvals) {
        characters.push(fmtChar(keyval[0]));
        amounts.push(keyval[1][orderVal === "char" ? "added" : field]);
    }

    if (charChart === null) {
        charChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: characters,
                datasets: [
                    {
                        label: orderVal === "char" ? "added" : orderVal,
                        data: amounts,
                        backgroundColor: chartColors,
                        borderColor: "#282828",
                        border: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                scales: {
                    x: {
                        grid: {
                            color: "#212121",
                        },
                    },
                    y: {
                        ticks: {
                            autoSkip: false,
                        },
                        grid: {
                            color: "#212121",
                        },
                    },
                },
                interaction: {
                    mode: "index",
                    axis: "y",
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                },
            },
        });
    } else {
        charChart.data.labels = characters;
        charChart.data.datasets[0].data = amounts;
        charChart.data.datasets[0].label = orderVal === "char" ? "added" : orderVal;

        const bars = characters.length;
        let chartHeight = 300;
        if (bars > 10) {
            chartHeight += (bars - 10) * 30;
            canvas.parentNode.style.height = `${chartHeight}px`;
        } else {
            canvas.parentNode.style.height = `60vh`;
        }

        charChart.update();
    }
};

const initializeCharChart = (coderankData) => {
    const durationSelect = document.getElementById("char-duration-select");
    const machineSelect = document.getElementById("char-machine-select");
    const editorSelect = document.getElementById("char-editor-select");
    const langSelect = document.getElementById("char-lang-select");
    const orderSelect = document.getElementById("char-order-select");
    const orderValSelect = document.getElementById("char-order-val-select");

    const update = () => {
        const duration = durationSelect.value;
        const machine = machineSelect.value;
        const editor = editorSelect.value;
        const language = langSelect.value;
        const order = orderSelect.value;
        const orderVal = orderValSelect.value;

        const characters = getCharactersDataInDuration(
            ...getDataAndKeysFromDuration(coderankData, duration),
            machine,
            editor,
            language
        );
        populateCharChart(characters, order, orderVal);
    };

    buildDurationSelect("char-duration-select", coderankData, () => {
        const duration = durationSelect.value;
        buildMachineSelect(
            "char-machine-select",
            coderankData,
            duration,
            machineSelect.value,
            () => {
                const machine = machineSelect.value;
                buildEditorSelect(
                    "char-editor-select",
                    coderankData,
                    duration,
                    machine,
                    editorSelect.value,
                    () => {
                        buildLanguageSelect(
                            "char-lang-select",
                            coderankData,
                            duration,
                            machine,
                            editorSelect.value,
                            langSelect.value,
                            () => {
                                update();
                            }
                        );
                        update();
                    }
                );
                update();
            }
        );
        update();
    });

    buildSelect("char-order-select", ["asc.", "desc."], {
        onChange: update,
    });

    buildSelect("char-order-val-select", POSSIBLE_CHARACTER_VALUES.concat("char"), {
        onChange: update,
    });
    selectVal("char-duration-select", "all time");
    selectVal("char-order-select", "desc.");
};
