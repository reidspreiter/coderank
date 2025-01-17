const SUPPORTED_VERSION = "0.2.0";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const coderankData = await loadCoderankData();
        constructSelect("stats-select", coderankData.keys(), {
            onChange: (opt) => {
                if (opt !== "total") {
                    const activeWeeks = coderankData.get(opt).weeks.reduce((wks, entry) => {
                        if (entry.added > 0 || entry.deleted > 0) {
                            wks.push(entry.week);
                        }
                        return wks;
                    }, []);
                    constructSelect("week-select", ["..."].concat(...activeWeeks), {
                        optionText: ["..."].concat(
                            ...activeWeeks.map((week) => getISODateOfWeek(week, opt))
                        ),
                        onChange: (week) => {
                            initializeStatsTable(coderankData.get(opt).weeks[week - 1]);
                        },
                    });
                } else {
                    constructSelect("week-select", ["..."]);
                }
                initializeStatsTable(coderankData.get(opt));
            },
        });
        initializeStatsTable(coderankData.get("total"));
        constructSelect("week-select", ["..."]);
    } catch (err) {
        if (err.cause === "Unsupported Schema Version") {
            console.error("Upsuported Schema Version");
        } else {
            console.error(`Error loading coderank data: ${err}`);
        }
    }
});

const getISODateOfWeek = (week, year) => {
    const day = 1 + (week - 1) * 7;
    const date = new Date(year, 0, day);

    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const formatNumber = (numOrStr) => {
    if (typeof numOrStr === "string") {
        numOrStr = Number(numOrStr);
    }
    return numOrStr.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const formatKeyVal = (arrOrObj) => {
    if (!Array.isArray(arrOrObj)) {
        arrOrObj = Object.values(arrOrObj);
    }
    const [key, val] = arrOrObj;
    return `'${key}' : ${formatNumber(val)}`;
};

/*
 * Returns a map containing yearly and total coderank data
 */
const loadCoderankData = async () => {
    const data = new Map();

    const addContentsToMap = async (key, filename) => {
        const response = await fetch(`./coderank/${filename}`);
        const json = await response.json();
        if (json.version !== SUPPORTED_VERSION) {
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

const constructKeyValueTable = (id, map) => {
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

const constructSelect = (id, options, { optionText = null, onChange = null } = {}) => {
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

const initializeStatsTable = (coderankData) => {
    const actualRank = coderankData.rank + coderankData.rankBuffer / 10000;
    const rows = new Map([
        ["rank", formatNumber(actualRank)],
        ["net", formatNumber(coderankData.net)],
        ["added", formatNumber(coderankData.added)],
        ["deleted", formatNumber(coderankData.deleted)],
        [
            "languages",
            coderankData.languages
                .map((entry) => entry.language)
                .sort()
                .join(", "),
        ],
        ["average net per rank", formatNumber(coderankData.net / actualRank)],
        ["average added per rank", formatNumber(coderankData.added / actualRank)],
        ["average deleted per rank", formatNumber(coderankData.deleted / actualRank)],
        [
            "most used character",
            formatKeyVal(
                Object.entries(coderankData.chars).reduce(
                    (max, [key, value]) => (value > max[1] ? [key, value] : max),
                    [null, -Infinity]
                )
            ),
        ],
        [
            "least used character",
            formatKeyVal(
                Object.entries(coderankData.chars).reduce(
                    (min, [key, value]) => (value < min[1] ? [key, value] : min),
                    [null, Infinity]
                )
            ),
        ],
        [
            "most added language",
            formatKeyVal(
                coderankData.languages.reduce(
                    (max, { language, added }) => (added > max.added ? { language, added } : max),
                    { language: "", added: -Infinity }
                )
            ),
        ],
        [
            "least added language",
            formatKeyVal(
                coderankData.languages.reduce(
                    (min, { language, added }) => (added < min.added ? { language, added } : min),
                    { language: "", added: Infinity }
                )
            ),
        ],
        [
            "most deleted language",
            formatKeyVal(
                coderankData.languages.reduce(
                    (max, { language, deleted }) =>
                        deleted > max.deleted ? { language, deleted } : max,
                    { language: "", deleted: -Infinity }
                )
            ),
        ],
        [
            "least deleted language",
            formatKeyVal(
                coderankData.languages.reduce(
                    (min, { language, deleted }) =>
                        deleted < min.deleted ? { language, deleted } : min,
                    { language: "", deleted: Infinity }
                )
            ),
        ],
    ]);
    constructKeyValueTable("stats-table", rows);
};
