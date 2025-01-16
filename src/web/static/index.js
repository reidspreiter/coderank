const SUPPORTED_VERSION = "0.2.0";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const coderankData = await loadCoderankData();
        initializeStatsTable(coderankData.get("total"));
    } catch (err) {
        if (err.cause === "Unsupported Schema Version") {
            console.error("Upsuported Schema Version");
        } else {
            console.error(`Error loading coderank data: ${err}`);
        }
    }
});

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

    // to fetch other stats without globbing the directory of files available,
    // start at 2024 and check for files until reaching the current year

    await addContentsToMap("total", "totalcoderank.json");
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

const initializeStatsTable = (coderankData) => {
    const actualRank = coderankData.rank + coderankData.rankBuffer / 10000;
    const rows = new Map([
        ["rank", formatNumber(actualRank)],
        ["net", formatNumber(coderankData.net)],
        ["added", formatNumber(coderankData.added)],
        ["deleted", formatNumber(coderankData.deleted)],
        ["languages", coderankData.languages.map((entry) => entry.language).join(", ")],
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
    constructKeyValueTable("header-table", rows);
};
