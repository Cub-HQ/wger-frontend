import { API_MAX_PAGE_SIZE, ApiPath } from "@/core/lib/consts";
import { fetchPaginated } from "@/core/lib/requests";
import { makeHeader, makeUrl } from "@/core/lib/url";

/*
 * A ride, run or swim mirrored read-only from Intervals.icu (wger-gym#6).
 *
 * Values are the server's verbatim copies in Intervals units; null means
 * Intervals had no value, never zero. It is not a workout session and has no
 * sets. Edits happen in Intervals only.
 */
export interface EnduranceEntry {
    id: string;
    kind: 'planned' | 'completed';
    sport: string | null;
    name: string | null;
    // Athlete-local wall clock, YYYY-MM-DD; the calendar groups by it as is
    localDate: string;
    startLocal: string;
    movingTimeS: number | null;
    elapsedTimeS: number | null;
    distanceM: number | null;
    // Intervals "Load", unitless, TSS only when power-based
    trainingLoad: number | null;
    loadTarget: number | null;
    timeTargetS: number | null;
    intensity: number | null;
    avgHr: number | null;
    maxHr: number | null;
    link: string;
    // false: planned events have no route of their own, the link opens the day
    linkExact: boolean;
}

// The subset of the /api/v2/endurance-entry/ row the calendar reads
export interface ApiEnduranceEntry {
    id: string;
    kind: 'planned' | 'completed';
    sport: string | null;
    name: string | null;
    local_date: string;
    start_local: string;
    moving_time_s: number | null;
    elapsed_time_s: number | null;
    distance_m: number | null;
    training_load: number | null;
    load_target: number | null;
    time_target: number | null;
    intensity: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    link: string;
    link_exact: boolean;
}

export const enduranceEntryFromJson = (json: ApiEnduranceEntry): EnduranceEntry => ({
    id: json.id,
    kind: json.kind,
    sport: json.sport,
    name: json.name,
    localDate: json.local_date,
    startLocal: json.start_local,
    movingTimeS: json.moving_time_s,
    elapsedTimeS: json.elapsed_time_s,
    distanceM: json.distance_m,
    trainingLoad: json.training_load,
    loadTarget: json.load_target,
    timeTargetS: json.time_target,
    intensity: json.intensity,
    avgHr: json.avg_hr,
    maxHr: json.max_hr,
    link: json.link,
    linkExact: json.link_exact,
});

// Inclusive athlete-local days, YYYY-MM-DD
export type EnduranceWindow = { from: string, to: string };

// Rows deleted in Intervals stay in the mirror as 'missing'; the calendar
// shows only what Intervals still has
export const getEnduranceEntries = async (window: EnduranceWindow): Promise<EnduranceEntry[]> => {
    const url = makeUrl(ApiPath.ENDURANCE_ENTRY, {
        query: { limit: API_MAX_PAGE_SIZE, upstream_state: 'present', local_date__gte: window.from, local_date__lte: window.to }
    });
    const out: EnduranceEntry[] = [];
    for await (const page of fetchPaginated(url, makeHeader())) {
        out.push(...page.map(enduranceEntryFromJson));
    }
    return out;
};
