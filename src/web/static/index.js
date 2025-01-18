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
        initializeLanguagesChart(coderankData);
        removeLoader();
    } catch (err) {
        if (err.cause === "Unsupported Schema Version") {
            console.error("Upsuported Schema Version");
        } else {
            console.error(`Error loading coderank data: ${err}`);
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

const fmtNumber = (numOrStr) => {
    if (typeof numOrStr === "string") {
        numOrStr = Number(numOrStr);
    }
    return numOrStr.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const fmtKeyVal = (arrOrObj, { quotes = false } = {}) => {
    if (!Array.isArray(arrOrObj)) {
        arrOrObj = Object.values(arrOrObj);
    }
    let [key, val] = arrOrObj;
    key = quotes ? `'${key}'` : key;
    return `${key} : ${fmtNumber(val)}`;
};

/*
 * Returns a map containing yearly and total coderank data
 */
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

const buildSelect = (id, options, { optionText = null, onChange = null } = {}) => {
    const select = document.getElementById(id);
    select.innerHTML = "";
    if (onChange !== null) {
        select.addEventListener("change", function () {
            onChange(this.value);
        });
    }

    options.forEach((opt, i) => {
        const option = document.createElement("option");
        option.value = opt;
        option.text = optionText ? optionText[i] : opt;
        select.appendChild(option);
    });
};

const selectVal = (id, option) => {
    const selectElement = document.getElementById(id);
    selectElement.value = option;
    const event = new Event('change');
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
                { quotes: true }
            ),
        ],
        [
            "least used character",
            fmtKeyVal(
                Object.entries(data.chars).reduce(
                    (min, [key, value]) => (value < min[1] ? [key, value] : min),
                    [null, Infinity]
                ),
                { quotes: true }
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
    buildSelect("stats-select", coderankData.keys(), {
        onChange: (stats) => {
            const data = coderankData.get(stats);
            if (stats !== "total") {
                const activeWeeks = getActiveWeeks(data);
                buildSelect("week-select", ["all"].concat(...activeWeeks), {
                    optionText: ["all"].concat(...activeWeeks.map((week) => getISOWeek(week, stats))),
                    onChange: (week) => {
                        populateStatsTable(week === "all" ? data : data.weeks[week - 1]);
                    },
                });
            } else {
                buildSelect("week-select", ["n/a"]);
            }
            populateStatsTable(data);
        },
    });
    selectVal("stats-select", "total");
};

let languagesChart = null;
const populateLanguagesChart = (data, value) => {
    const canvas = document.getElementById("languages-chart");
    const languages = [];
    const values = [];

    data.languages
        .sort((a, b) => a.language.localeCompare(b.language))
        .forEach((entry, i) => {
            if (value === "net" || entry[value] !== 0) {
                languages.push(entry.language);
                values.push(value === "net" ? entry.added - entry.deleted : entry[value]);
            }
        });

    if (languagesChart === null) {
        languagesChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: languages,
                datasets: [
                    {
                        label: value,
                        data: values,
                        backgroundColor: chartColors,
                        borderColor: "#202020",
                        border: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            boxWidth: 20,
                            boxHeight: 10,
                        },
                    },
                },
            },
        });
    } else {
        languagesChart.data.labels = languages;
        const dataset = languagesChart.data.datasets[0];
        dataset.data = values;
        dataset.label = value;
        languagesChart.update();
    }
};


const initializeLanguagesChart = (coderankData) => {
    buildSelect("lang-stats-select", coderankData.keys(), {
        onChange: (stats) => {
            const data = coderankData.get(stats);
            const value = document.getElementById("lang-value-select").value;
            if (stats !== "total") {
                const activeWeeks = getActiveWeeks(data);
                buildSelect("lang-week-select", ["all"].concat(...activeWeeks), {
                    optionText: ["all"].concat(...activeWeeks.map((week) => getISOWeek(week, stats))),
                    onChange: (week) => {
                        populateLanguagesChart(week === "all" ? data : data.weeks[week - 1], value);
                    },
                });
            } else {
                buildSelect("lang-week-select", ["n/a"]);
            }
            populateLanguagesChart(data, value);
        },
    });
    buildSelect("lang-value-select", ["added", "deleted", "net"], {
        onChange: (value) => {
            const stats = document.getElementById("lang-stats-select").value;
            const week = document.getElementById("lang-week-select").value;
            let data = coderankData.get(stats);
            if (stats !== "total") {
                data = week === "all" ? data : data.weeks[week - 1];
            }
            populateLanguagesChart(data, value);
        }
    });
    selectVal("lang-value-select", "added");
    selectVal("lang-stats-select", "total");
};

const removeLoader = () => {
    document.getElementById("loader").remove();
};
