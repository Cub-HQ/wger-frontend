export const PROGRESSION_CHART_RANGES = [
    { value: "last6", label: "Last 6 sessions", sessions: 6 },
    { value: "1m", label: "1 month", months: 1 },
    { value: "3m", label: "3 months", months: 3 },
    { value: "6m", label: "6 months", months: 6 },
    { value: "1y", label: "1 year", months: 12 },
    { value: "2y", label: "2 years", months: 24 },
    { value: "3y", label: "3 years", months: 36 },
    { value: "all", label: "All time", months: null },
] as const;
export type ProgressionChartRange = typeof PROGRESSION_CHART_RANGES[number]["value"];
const STORAGE_KEY = "wger.progressionChartRange";
const DEFAULT_RANGE: ProgressionChartRange = "last6";

export const loadProgressionChartRange = (): ProgressionChartRange => {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return PROGRESSION_CHART_RANGES.some(option => option.value === stored)
            ? stored as ProgressionChartRange
            : DEFAULT_RANGE;
    } catch { return DEFAULT_RANGE; }
};

export const saveProgressionChartRange = (range: ProgressionChartRange) => {
    try { window.localStorage.setItem(STORAGE_KEY, range); } catch { /* The current page still uses the pick. */ }
};

export const mountProgressionChartRangeSetting = () => {
    if (!/^\/[a-z-]+\/user\/preferences\/?$/.test(window.location.pathname)) return;
    const content = document.getElementById("content");
    if (!content || document.getElementById("progression-chart-range")) return;
    const card = document.createElement("div");
    card.className = "card mb-3";
    const body = document.createElement("div");
    body.className = "card-body";
    const label = document.createElement("label");
    label.className = "form-label";
    label.htmlFor = "progression-chart-range";
    label.textContent = "Exercise chart range";
    const select = document.createElement("select");
    select.className = "form-select";
    select.id = "progression-chart-range";
    PROGRESSION_CHART_RANGES.forEach(option => {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        select.append(item);
    });
    select.value = loadProgressionChartRange();
    select.addEventListener("change", () => saveProgressionChartRange(select.value as ProgressionChartRange));
    const help = document.createElement("div");
    help.className = "form-text";
    help.textContent = "Changes are saved automatically and apply to every exercise chart.";
    body.append(label, select, help);
    card.append(body);
    content.prepend(card);
};

// A log without a session counts its day as the session
export const sessionKey = (entry: { date: Date; sessionId: string | null }) => entry.sessionId ?? entry.date.toDateString();

export const filterProgressionChartData = <T extends { date: Date; sessionId: string | null }>(
    data: T[],
    range: ProgressionChartRange = loadProgressionChartRange(),
    now: Date = new Date(),
): T[] => {
    const option = PROGRESSION_CHART_RANGES.find(item => item.value === range);
    if (!option) return filterProgressionChartData(data, DEFAULT_RANGE, now);
    if ("sessions" in option) {
        // The newest N performed sessions however old, with every set they hold
        const started = new Map<string, number>();
        data.forEach(entry => started.set(sessionKey(entry), Math.max(started.get(sessionKey(entry)) ?? -Infinity, entry.date.getTime())));
        const kept = new Set([...started].sort((a, b) => b[1] - a[1]).slice(0, option.sessions).map(([key]) => key));
        return data.filter(entry => kept.has(sessionKey(entry)));
    }
    if (option.months === null) return data;
    const cutoff = new Date(now);
    const day = cutoff.getDate();
    cutoff.setDate(1);
    cutoff.setMonth(cutoff.getMonth() - option.months);
    cutoff.setDate(Math.min(day, new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate()));
    return data.filter(entry => entry.date >= cutoff && entry.date <= now);
};
