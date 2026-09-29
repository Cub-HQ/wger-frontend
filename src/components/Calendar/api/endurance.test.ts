import { getEnduranceEntries } from "@/components/Calendar/api/endurance";
import axios from "axios";
import type { Mock } from 'vitest';

vi.mock("axios");

describe('getEnduranceEntries', () => {
    test('reads present rows of the window over every page and keeps nulls as nulls', async () => {
        // Shaped like EnduranceEntrySerializer in wger/intervals/api/views.py
        const planned = {
            id: '0192-a', kind: 'planned', intervals_id: '5501', sport: 'Run', name: null,
            start_local: '2026-09-28T06:00:00', local_date: '2026-09-28', timezone: null,
            moving_time_s: null, elapsed_time_s: null, distance_m: null, training_load: null,
            power_load: null, hr_load: null, pace_load: null, hr_load_type: null, pace_load_type: null,
            intensity: null, avg_hr: null, max_hr: null, rpe: null, feel: null,
            load_target: 38, time_target: 2700, paired_event_id: null, activity_source: null,
            upstream_state: 'present', fetched_at: '2026-09-29T00:00:00Z',
            link: 'https://intervals.icu/?s=2026-09-28&e=2026-09-28', link_exact: false,
        };
        const ride = { ...planned, id: '0192-b', kind: 'completed', sport: 'Ride', moving_time_s: 14400, training_load: 212, avg_hr: 131, link: 'https://intervals.icu/activities/i9001', link_exact: true };
        (axios.get as Mock)
            .mockResolvedValueOnce({ data: { results: [planned], next: 'http://localhost:8000/api/v2/endurance-entry/?page=2' } })
            .mockResolvedValueOnce({ data: { results: [ride], next: null } });

        const entries = await getEnduranceEntries({ from: '2026-09-01', to: '2026-09-30' });

        expect((axios.get as Mock).mock.calls[0][0]).toContain('/api/v2/endurance-entry/?limit=999&upstream_state=present&local_date__gte=2026-09-01&local_date__lte=2026-09-30');
        expect(entries).toEqual([
            expect.objectContaining({ kind: 'planned', localDate: '2026-09-28', startLocal: '2026-09-28T06:00:00', movingTimeS: null, trainingLoad: null, loadTarget: 38, timeTargetS: 2700, avgHr: null, linkExact: false }),
            expect.objectContaining({ kind: 'completed', sport: 'Ride', movingTimeS: 14400, trainingLoad: 212, avgHr: 131, link: 'https://intervals.icu/activities/i9001', linkExact: true }),
        ]);
    });
});
