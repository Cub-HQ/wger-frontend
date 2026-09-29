import { filterProgressionChartData, loadProgressionChartRange } from "@/components/Routines/widgets/progressionChartRange";

const now = new Date(2026, 8, 29, 12);
// n sets per session, all stamped with the session start as the chart receives them
const sessionSets = (sessionId: string, start: Date, n = 3) => Array.from({ length: n }, (_, i) => ({ id: `${sessionId}-${i}`, sessionId, date: start }));

beforeEach(() => window.localStorage.clear());

describe('filterProgressionChartData', () => {
    test('Last 6 sessions keeps six whole sessions, not six sets', () => {
        const data = Array.from({ length: 8 }, (_, i) => sessionSets(`s${i}`, new Date(2026, 0, i + 1, 9))).flat();

        const kept = filterProgressionChartData(data, "last6", now);

        expect(kept).toHaveLength(18);
        expect(new Set(kept.map(entry => entry.sessionId))).toEqual(new Set(['s2', 's3', 's4', 's5', 's6', 's7']));
    });

    test('Two workouts on the same day are two sessions', () => {
        const data = [
            ...sessionSets('old', new Date(2026, 0, 1, 9)),
            ...Array.from({ length: 3 }, (_, i) => sessionSets(`day${i}`, new Date(2026, 0, 10 + i, 9))).flat(),
            ...sessionSets('morning', new Date(2026, 1, 1, 7)),
            ...sessionSets('evening', new Date(2026, 1, 1, 18)),
        ];

        const kept = filterProgressionChartData(data, "last6", now);

        expect(new Set(kept.map(entry => entry.sessionId))).toEqual(new Set(['day0', 'day1', 'day2', 'morning', 'evening', 'old']));
        const withoutOld = filterProgressionChartData([...data, ...sessionSets('newest', new Date(2026, 2, 1))], "last6", now);
        expect(withoutOld.some(entry => entry.sessionId === 'old')).toBe(false);
        expect(withoutOld.filter(entry => entry.date.getTime() === new Date(2026, 1, 1, 7).getTime())).toHaveLength(3);
    });

    test('Sessions from 2023 are still charted by default when they are the latest', () => {
        const data = [...sessionSets('jan-a', new Date(2023, 0, 10, 9)), ...sessionSets('jan-b', new Date(2023, 0, 17, 9))];

        expect(filterProgressionChartData(data, undefined, now)).toEqual(data);
        // The previous month windows hid them all
        expect(filterProgressionChartData(data, "3y", now)).toEqual([]);
    });

    test('Unordered input still keeps the newest sessions', () => {
        const data = Array.from({ length: 7 }, (_, i) => sessionSets(`s${i}`, new Date(2025, i, 1), 1)).flat().reverse();

        const kept = filterProgressionChartData(data, "last6", now);

        expect(kept.map(entry => entry.sessionId).sort()).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    });

    test('Logs without a session count one session per day', () => {
        const data = Array.from({ length: 7 }, (_, i) => ({ id: i, sessionId: null, date: new Date(2026, 0, i + 1) }));

        expect(filterProgressionChartData(data, "last6", now).map(entry => entry.id)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('Month ranges and all time keep their behaviour', () => {
        const data = [
            ...sessionSets('recent', new Date(2026, 7, 1)),
            ...sessionSets('year-ago', new Date(2025, 11, 1)),
            ...sessionSets('ancient', new Date(2020, 0, 1)),
        ];

        expect(filterProgressionChartData(data, "6m", now).map(entry => entry.sessionId)).toEqual(['recent', 'recent', 'recent']);
        expect(filterProgressionChartData(data, "1y", now)).toHaveLength(6);
        expect(filterProgressionChartData(data, "all", now)).toEqual(data);
    });
});

describe('loadProgressionChartRange', () => {
    test('Defaults to the last 6 sessions and keeps a stored month range', () => {
        expect(loadProgressionChartRange()).toBe("last6");
        window.localStorage.setItem("wger.progressionChartRange", "bogus");
        expect(loadProgressionChartRange()).toBe("last6");
        window.localStorage.setItem("wger.progressionChartRange", "1y");
        expect(loadProgressionChartRange()).toBe("1y");
    });
});
