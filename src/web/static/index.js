const SUPPORTED_VERSIONS = ["0.2.0"];

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
        if (err.cause === "Unsupported Schema Version") {
            console.error("UpsupPorted Schema Version");
        } else {
            console.error(`Error loading coderank data: ${err}`);
            throw err;
        }
    }
});

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
    };
    return `'${map[char] || char}'`;
};

const fmtNumber = (numOrStr) => {
    if (typeof numOrStr === "string") {
        numOrStr = Number(numOrStr);
    }
    return numOrStr.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const fmtKeyVal = (arrOrObj, { char = false } = {}) => {
    if (!Array.isArray(arrOrObj)) {
        arrOrObj = Object.values(arrOrObj);
    }
    let [key, val] = arrOrObj;
    key = char ? fmtChar(key) : key;
    return `${key} : ${fmtNumber(val)}`;
};

//
// Returns a map containing yearly and total coderank data
//
const loadCoderankData = async () => {
    const data = new Map();

    const addContentsToMap = async (key, filename) => {
        const response = await fetch(`./coderank/${filename}`);
        const json = await response.json();
        if (!SUPPORTED_VERSIONS.includes(json.version)) {
            throw Error("Unsupported Schema Version");
        }
        data.set(key, json);
    };

    await addContentsToMap("total", "totalcoderank.json");

    await Promise.all(
        data.get("total").years.map(async (year) => {
            await addContentsToMap(year, `coderank${year}.json`);
        })
    );
    return data;
};

const sumChars = (base, addend) => {
    for (const [key, val] of Object.entries(addend)) {
        base[key] = (base[key] ?? 0) + val;
    }
    return base;
};

const buildKeyValTable = (id, map) => {
    const table = document.getElementById(id);
    table.innerHTML = "";

    map.forEach((value, key) => {
        const row = document.createElement("tr");

        const keyCell = document.createElement("td");
        keyCell.textContent = key;
        row.appendChild(keyCell);

        const valueCell = document.createElement("td");
        valueCell.textContent = value;
        row.appendChild(valueCell);

        table.appendChild(row);
    });
};

//
// Maintain a listeners map to allow onChange to be defined inline and replaced
// without replacing the entire node
//
const listeners = new Map();
const buildSelect = (id, options, { optionText = null, onChange = null } = {}) => {
    const select = document.getElementById(id);
    select.innerHTML = "";

    if (onChange !== null) {
        if (listeners.has(id)) {
            select.removeEventListener("change", listeners.get(id));
        }
        select.addEventListener("change", onChange);
        listeners.set(id, onChange);
    }

    options.forEach((opt, i) => {
        const option = document.createElement("option");
        option.value = opt;
        option.text = optionText ? optionText[i] : opt;
        select.appendChild(option);
    });
};

const buildWeekSelect = (coderankData, stats, id, onChange) => {
    if (stats !== "total") {
        const activeWeeks = getActiveWeeks(coderankData.get(stats));
        buildSelect(id, ["all"].concat(...activeWeeks), {
            optionText: ["all"].concat(...activeWeeks.map((week) => getISOWeek(week, stats))),
            onChange: onChange,
        });
    } else {
        buildSelect(id, ["n/a"]);
    }
};

const selectVal = (id, option) => {
    const selectElement = document.getElementById(id);
    selectElement.value = option;
    const event = new Event("change");
    selectElement.dispatchEvent(event);
};

const populateStatsTable = (data) => {
    const actualRank = data.rank + data.rankBuffer / 10000;
    const rows = new Map([
        [
            "rank",
            `${fmtNumber(actualRank)} : ${fmtNumber(actualRank * 10000)} individual typing actions`,
        ],
        ["net", fmtNumber(data.net)],
        ["added", fmtNumber(data.added)],
        ["deleted", fmtNumber(data.deleted)],
        [
            "languages",
            data.languages
                .map((entry) => entry.language)
                .sort()
                .join(", "),
        ],
        ["average net per rank", fmtNumber(data.net / actualRank)],
        ["average added per rank", fmtNumber(data.added / actualRank)],
        ["average deleted per rank", fmtNumber(data.deleted / actualRank)],
        [
            "most used character",
            fmtKeyVal(
                Object.entries(data.chars).reduce(
                    (max, [key, value]) => (value > max[1] ? [key, value] : max),
                    [null, -Infinity]
                ),
                { char: true }
            ),
        ],
        [
            "least used character",
            fmtKeyVal(
                Object.entries(data.chars).reduce(
                    (min, [key, value]) => (value < min[1] ? [key, value] : min),
                    [null, Infinity]
                ),
                { char: true }
            ),
        ],
        [
            "most added language",
            fmtKeyVal(
                data.languages.reduce(
                    (max, { language, added }) => (added > max.added ? { language, added } : max),
                    { language: "", added: -Infinity }
                )
            ),
        ],
        [
            "least added language",
            fmtKeyVal(
                data.languages.reduce(
                    (min, { language, added }) => (added < min.added ? { language, added } : min),
                    { language: "", added: Infinity }
                )
            ),
        ],
        [
            "most deleted language",
            fmtKeyVal(
                data.languages.reduce(
                    (max, { language, deleted }) =>
                        deleted > max.deleted ? { language, deleted } : max,
                    { language: "", deleted: -Infinity }
                )
            ),
        ],
        [
            "least deleted language",
            fmtKeyVal(
                data.languages.reduce(
                    (min, { language, deleted }) =>
                        deleted < min.deleted ? { language, deleted } : min,
                    { language: "", deleted: Infinity }
                )
            ),
        ],
    ]);
    buildKeyValTable("stats-table", rows);
};

const initializeStatsTable = (coderankData) => {
    const statsSelect = document.getElementById("stats-select");
    const weekSelect = document.getElementById("week-select");
    const update = () => {
        const stats = statsSelect.value;
        const week = weekSelect.value;
        const data = coderankData.get(stats);
        populateStatsTable(stats === "total" || week === "all" ? data : data.weeks[week - 1]);
    };

    buildSelect("stats-select", coderankData.keys(), {
        onChange: () => {
            buildWeekSelect(coderankData, statsSelect.value, "week-select", update);
            update();
        },
    });
    selectVal("stats-select", "total");
};

let langChart = null;
const populateLangChart = (data, value) => {
    const canvas = document.getElementById("lang-chart");
    const languages = [];
    const values = [];

    data.languages
        .sort((a, b) => a.language.localeCompare(b.language))
        .forEach((entry) => {
            if (value === "net" || entry[value] !== 0) {
                languages.push(entry.language);
                values.push(value === "net" ? entry.added - entry.deleted : entry[value]);
            }
        });

    if (langChart === null) {
        langChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: languages,
                datasets: [
                    {
                        label: value,
                        data: values,
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
        langChart.data.labels = languages;
        const dataset = langChart.data.datasets[0];
        dataset.data = values;
        dataset.label = value;
        langChart.update();
    }
};

const initializeLangChart = (coderankData) => {
    const statsSelect = document.getElementById("lang-stats-select");
    const weekSelect = document.getElementById("lang-week-select");
    const valueSelect = document.getElementById("lang-value-select");
    const update = () => {
        const stats = statsSelect.value;
        const week = weekSelect.value;
        const value = valueSelect.value;
        const data = coderankData.get(stats);
        populateLangChart(stats === "total" || week === "all" ? data : data.weeks[week - 1], value);
    };

    buildSelect("lang-stats-select", coderankData.keys(), {
        onChange: () => {
            buildWeekSelect(coderankData, statsSelect.value, "lang-week-select", update);
            update();
        },
    });

    buildSelect("lang-value-select", ["added", "deleted", "net"], {
        onChange: update,
    });

    selectVal("lang-value-select", "added");
    selectVal("lang-stats-select", "total");
};

let charChart = null;
const populateCharChart = (chars, num, order) => {
    const canvas = document.getElementById("char-chart");
    const characters = [];
    const amounts = [];
    const keyvals = Object.entries(chars).sort(
        order === "asc. amount"
            ? (a, b) => a[1] - b[1]
            : order === "desc. amount"
              ? (a, b) => b[1] - a[1]
              : order === "asc. char"
                ? (a, b) => a[0].localeCompare(b[0])
                : (a, b) => b[0].localeCompare(a[0])
    );

    for (const [i, keyval] of keyvals.entries()) {
        if (i >= num) {
            break;
        }
        characters.push(fmtChar(keyval[0]));
        amounts.push(keyval[1]);
    }

    if (charChart === null) {
        charChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: characters,
                datasets: [
                    {
                        label: "added",
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
    const statsSelect = document.getElementById("char-stats-select");
    const weekSelect = document.getElementById("char-week-select");
    const langSelect = document.getElementById("char-lang-select");
    const numSelect = document.getElementById("char-num-select");
    const orderSelect = document.getElementById("char-order-select");
    const update = () => {
        const stats = statsSelect.value;
        const week = weekSelect.value;
        const language = langSelect.value;
        const num = numSelect.value;
        const order = orderSelect.value;
        let data = coderankData.get(stats);
        if (!(stats === "total" || (week === "all" && language === "all"))) {
            if (week === "all") {
                // To reduce file size, language-specific chars are not computed for yearly totals
                // They may be added in the future if performance demands it
                let chars = {};
                data.weeks.forEach((week) => {
                    const entry = week.languages.find((entry) => entry.language === language);
                    if (entry !== undefined) {
                        chars = sumChars(chars, entry.chars);
                    }
                });
                populateCharChart(chars, num, order);
                return;
            } else {
                data = data.weeks[week - 1];
                if (language !== "all") {
                    data = data.languages.find((entry) => entry.language === language);
                }
            }
        }
        populateCharChart(data.chars, num, order);
    };

    const buildNumSelect = (stats, week, language) => {
        const currNum = Number(numSelect.value);
        const currSelectedIndex = numSelect.options.selectedIndex;
        let data = coderankData.get(stats);
        let total;

        if (!(stats === "total" || (week === "all" && language === "all"))) {
            if (week === "all") {
                const charSet = new Set();
                data.weeks.forEach((week) => {
                    const entry = week.languages.find((entry) => entry.language === language);
                    if (entry !== undefined) {
                        Object.keys(entry.chars).forEach((char) => charSet.add(char));
                    }
                });
                total = charSet.size;
            } else {
                if (language !== "all") {
                    data = data.weeks[week - 1].languages.find(
                        (entry) => entry.language === language
                    );
                }
            }
        }

        if (total === undefined) {
            total = Object.keys(data.chars).length;
        }

        const possibleNums = [5, 10, 25, 50, 100];
        const nums = possibleNums.filter((num) => num < total);
        buildSelect("char-num-select", nums.concat(total), {
            optionText: nums.concat(`all (${total})`),
            onChange: update,
        });

        numSelect.value =
            currNum === 0
                ? 5
                : currSelectedIndex === -1 || !nums.includes(currNum)
                  ? total
                  : currNum;
    };

    const buildLangSelect = (stats, week) => {
        if (stats !== "total") {
            const currLang = langSelect.value;
            const data =
                week === "all" ? coderankData.get(stats) : coderankData.get(stats).weeks[week - 1];
            const validLanguages = data.languages
                .reduce((langs, entry) => {
                    if (entry.added > 0) {
                        langs.push(entry.language);
                    }
                    return langs;
                }, [])
                .sort();

            buildSelect("char-lang-select", ["all"].concat(...validLanguages), {
                onChange: () => {
                    buildNumSelect(stats, week, langSelect.value);
                    update();
                },
            });

            if (validLanguages.includes(currLang)) {
                langSelect.value = currLang;
            }
        } else {
            buildSelect("char-lang-select", ["n/a"]);
        }
    };

    buildSelect("char-stats-select", coderankData.keys(), {
        onChange: () => {
            const stats = statsSelect.value;
            buildWeekSelect(coderankData, stats, "char-week-select", () => {
                const week = weekSelect.value;
                buildLangSelect(stats, week);
                buildNumSelect(stats, week, langSelect.value);
                update();
            });
            const week = weekSelect.value;
            buildLangSelect(stats, week);
            buildNumSelect(stats, week, langSelect.value);
            update();
        },
    });

    buildSelect("char-order-select", ["asc. amount", "desc. amount", "asc. char", "desc. char"], {
        onChange: update,
    });

    selectVal("char-order-select", "desc. amount");
    selectVal("char-num-select", "5");
    selectVal("char-stats-select", "total");
};

const removeLoader = () => {
    document.getElementById("loader").remove();
};
