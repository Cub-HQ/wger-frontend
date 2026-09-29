import type { Exercise } from "@/components/Exercises";
import type { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import type { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import {
    EXERCISE_CATEGORY_CARDIO,
    REP_UNIT_KILOMETERS,
    REP_UNIT_METERS,
    REP_UNIT_MILES,
    REP_UNIT_MINUTES,
    REP_UNIT_SECONDS,
    WEIGHT_UNIT_KMH,
    WEIGHT_UNIT_MPH
} from "@/core/lib/consts";

/*
 * Gym cardio stations (rower, ski erg, …) log every metric of a set on ONE log.
 *
 * The primary measure stays in repetitions/repetitions_unit, the unit the plan
 * prescribes. Time and distance that are not the primary measure go into
 * duration (seconds) and distance/distance_unit. The server rejects a time or
 * distance stored twice, so each quantity has exactly one place.
 */

export const TIME_UNITS = [REP_UNIT_SECONDS, REP_UNIT_MINUTES];
export const DISTANCE_UNITS = [REP_UNIT_METERS, REP_UNIT_KILOMETERS, REP_UNIT_MILES];
export const SPEED_UNITS = [WEIGHT_UNIT_KMH, WEIGHT_UNIT_MPH];

const UNIT_LABELS: Record<number, string> = {
    [REP_UNIT_METERS]: "m",
    [REP_UNIT_KILOMETERS]: "km",
    [REP_UNIT_MILES]: "mi",
};
const SPEED_LABELS: Record<number, string> = { [WEIGHT_UNIT_KMH]: "km/h", [WEIGHT_UNIT_MPH]: "mph" };
export const DISTANCE_UNIT_OPTIONS = DISTANCE_UNITS.map(id => ({ id, label: UNIT_LABELS[id] }));

export const distanceLabel = (unitId: number | null) => unitId === null ? "" : UNIT_LABELS[unitId] ?? "";
export const speedLabel = (unitId: number | null) => unitId === null ? "" : SPEED_LABELS[unitId] ?? "";

const isTimeUnit = (unitId: number | null) => unitId !== null && TIME_UNITS.includes(unitId);
const isDistanceUnit = (unitId: number | null) => unitId !== null && DISTANCE_UNITS.includes(unitId);
const isSpeedUnit = (unitId: number | null) => unitId !== null && SPEED_UNITS.includes(unitId);

// Older logs hold the max speed in weight with a km/h or mph unit; that is a speed, never a load
export const isLegacySpeed = (log: Pick<WorkoutLog, 'weight' | 'weightUnitId'>) => log.weight != null && isSpeedUnit(log.weightUnitId ?? null);

// Editing rule, apart from whether a speed is there: with a km/h or mph unit the weight is
// never a load, even once emptied, or a load typed in would be saved as a speed
export const weightUnitIsSpeed = (log: Pick<WorkoutLog, 'weightUnitId'>) => isSpeedUnit(log.weightUnitId ?? null);

// The primary measure (repetitions) counts a time or a distance, so it belongs
// to the Time/Distance inputs and is never edited as reps
export const isMetricPrimary = (repetitionUnitId: number | null | undefined) =>
    isTimeUnit(repetitionUnitId ?? null) || isDistanceUnit(repetitionUnitId ?? null);

/*
 * "1:02:03", "10:00" or "45" to seconds; null when empty, NaN when invalid.
 * Minutes and seconds under a larger part must stay below 60, only the
 * seconds may carry (up to two) decimals. Summed in hundredths so 12.34 s
 * stays exactly 12.34 and is never rounded by float arithmetic.
 */
export const parseDuration = (text: string): number | null => {
    const value = text.trim();
    if (value === "") return null;
    const parts = value.split(":");
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(parts.pop()!);
    if (parts.length > 2 || !match || parts.some(part => !/^\d+$/.test(part))) return NaN;
    const seconds = Number(match[1]);
    const [hours, minutes] = parts.length === 2 ? parts.map(Number) : [0, Number(parts[0] ?? 0)];
    if ((parts.length > 0 && seconds >= 60) || (parts.length === 2 && minutes >= 60)) return NaN;
    return (((hours * 60 + minutes) * 60 + seconds) * 100 + Number((match[2] ?? "").padEnd(2, "0"))) / 100;
};

// Seconds as HH:MM:SS, hundredths of a second are shown and not dropped. Split
// in whole hundredths: a Minutes log (e.g. 0.99999… × 60) must read 00:01:00, not 00:00:59
export const formatDuration = (seconds: number) => {
    const hundredths = Math.round(seconds * 100);
    const whole = Math.floor(hundredths / 100);
    const fraction = hundredths % 100;
    const clock = [Math.floor(whole / 3600), Math.floor(whole % 3600 / 60), whole % 60]
        .map(value => value.toString().padStart(2, "0")).join(":");
    return fraction > 0 ? `${clock}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}` : clock;
};

// The time of a set in seconds, from the primary measure or the secondary one
export const logSeconds = (log: WorkoutLog): number | null => {
    if (log.repetitions != null && isTimeUnit(log.repetitionUnitId ?? null)) {
        return log.repetitionUnitId === REP_UNIT_MINUTES ? log.repetitions * 60 : log.repetitions;
    }
    return log.duration ?? null;
};

export const logDistance = (log: WorkoutLog): { value: number, unitId: number } | null => {
    if (log.repetitions != null && isDistanceUnit(log.repetitionUnitId ?? null)) return { value: log.repetitions, unitId: log.repetitionUnitId! };
    return log.distance == null ? null : { value: log.distance, unitId: log.distanceUnitId! };
};

export const logMaxSpeed = (log: WorkoutLog): { value: number, unitId: number } | null => {
    if (log.maxSpeed != null) return { value: log.maxSpeed, unitId: log.maxSpeedUnitId! };
    return isLegacySpeed(log) ? { value: log.weight!, unitId: log.weightUnitId! } : null;
};

// Has the log any cardio value, including legacy speeds and a TIME/DISTANCE primary.
// Logs built without the cardio keys (older fixtures, plain objects) count as not having them
export const hasCardioMetrics = (log: WorkoutLog) =>
    [log.duration, log.distance, log.maxSpeed, log.incline, log.level, log.calories, log.averageSpeed, log.pace].some(value => value != null)
    || isLegacySpeed(log)
    || logSeconds(log) !== null
    || logDistance(log) !== null;

// Whether a planned set gets the cardio inputs instead of reps/weight/RiR
export const isCardioPlan = (exercise: Exercise | null | undefined, repetitionUnitId: number | null | undefined) =>
    exercise?.category?.id === EXERCISE_CATEGORY_CARDIO || isTimeUnit(repetitionUnitId ?? null) || isDistanceUnit(repetitionUnitId ?? null);

export type CardioFields = Pick<WorkoutLog,
    'repetitions' | 'repetitionUnitId' | 'weight' | 'weightUnitId' | 'duration' | 'distance' | 'distanceUnitId'
    | 'maxSpeed' | 'maxSpeedUnitId' | 'incline' | 'level' | 'calories'>;

// Whether the primary (repetitions: two decimals, below 10000) holds a value exactly
const fitsPrimary = (value: number) => Number.isInteger(Math.round(value * 1e6) / 1e4) && value < 10000;

/*
 * Where a time goes. A Seconds primary takes it as is, a Minutes primary only
 * when two-decimal minutes hold it exactly (2:05 is 2.0833… min), both only
 * while it fits the column. Otherwise the primary stays empty and the seconds
 * go into duration. Never rounded; the target is not touched.
 */
export const withTime = (log: CardioFields, seconds: number | null): Partial<CardioFields> => {
    if (!isTimeUnit(log.repetitionUnitId)) return { duration: seconds };
    if (seconds === null) return { repetitions: null, duration: null };
    const primary = log.repetitionUnitId === REP_UNIT_SECONDS ? seconds : seconds / 60;
    return fitsPrimary(primary) ? { repetitions: Math.round(primary * 100) / 100, duration: null } : { repetitions: null, duration: seconds };
};

/*
 * Where a distance goes. The primary takes it when it is in the primary's unit
 * and fits it (0.163 km has three decimals, the primary two). Otherwise it goes
 * into distance with its unit and the primary is emptied, so it never sits
 * there twice. Never rounded; the target is not touched.
 */
export const withDistance = (log: CardioFields, value: number | null, unitId: number): Partial<CardioFields> => {
    if (!isDistanceUnit(log.repetitionUnitId)) return { distance: value, distanceUnitId: value === null ? null : unitId };
    if (value === null) return { repetitions: null, distance: null, distanceUnitId: null };
    return unitId === log.repetitionUnitId && fitsPrimary(value)
        ? { repetitions: value, distance: null, distanceUnitId: null }
        : { repetitions: null, distance: value, distanceUnitId: unitId };
};

// New speeds are km/h; a speed held in weight (km/h or mph unit) is edited where it is, in its
// unit, also after it was emptied
export const withMaxSpeed = (log: CardioFields, value: number | null): Partial<CardioFields> => {
    if (weightUnitIsSpeed(log) && log.maxSpeed == null) return { weight: value };
    return { maxSpeed: value, maxSpeedUnitId: value === null ? null : log.maxSpeedUnitId ?? WEIGHT_UNIT_KMH };
};

// What the cardio inputs of a form hold, as typed
export interface CardioInput {
    time: string;
    distance: string;
    distanceUnitId: number;
    maxSpeed: string;
    incline: string;
    level: string;
    calories: string;
}

export const EMPTY_CARDIO_INPUT: CardioInput = {
    time: "", distance: "", distanceUnitId: REP_UNIT_KILOMETERS, maxSpeed: "", incline: "", level: "", calories: ""
};

const decimal = (text: string) => text.trim() === "" ? null : Number(text);

export const hasCardioInput = (input: CardioInput) =>
    [input.time, input.distance, input.maxSpeed, input.incline, input.level, input.calories].some(value => value.trim() !== "");

// The cardio metrics of a new set whose primary unit is `repetitionUnitId`
export const cardioFieldsOf = (input: CardioInput, repetitionUnitId: number | null, repetitions: number | null = null): CardioFields => {
    let log: CardioFields = {
        repetitions, repetitionUnitId, weight: null, weightUnitId: null, duration: null, distance: null, distanceUnitId: null,
        maxSpeed: null, maxSpeedUnitId: null, incline: decimal(input.incline), level: decimal(input.level), calories: decimal(input.calories)
    };
    if (input.time.trim() !== "") log = { ...log, ...withTime(log, parseDuration(input.time)) };
    if (input.distance.trim() !== "") log = { ...log, ...withDistance(log, decimal(input.distance), input.distanceUnitId) };
    if (input.maxSpeed.trim() !== "") log = { ...log, ...withMaxSpeed(log, decimal(input.maxSpeed)) };
    return log;
};

// The same limits the server has (digits, decimal places), checked before sending instead of rounding
export const LIMITS = {
    distance: { places: 3, below: 100000 },
    maxSpeed: { places: 2, below: 10000 },
    incline: { places: 2, below: 10000 },
    level: { places: 1, below: 1000 },
    calories: { places: 2, below: 1000000 },
} as const;
export const validDecimal = (text: string | undefined, limit: { places: number, below: number }) => {
    const value = (text ?? "").trim();
    return value === "" || (new RegExp(`^\\d+(\\.\\d{1,${limit.places}})?$`).test(value) && Number(value) < limit.below);
};
export const validDuration = (text: string | undefined) => {
    const seconds = parseDuration(text ?? "");
    return seconds === null || (!Number.isNaN(seconds) && seconds < 100000);
};

const MILES_TO_KM = 1.609344;

// "Time 00:10:00 · Distance 2.1 km · Max speed 14.2 km/h · Incline 1.5% · Level 5 · 120 kcal"
export const cardioMetrics = (log: WorkoutLog) => {
    const metrics: string[] = [];
    const seconds = logSeconds(log);
    if (seconds !== null) metrics.push(`Time ${formatDuration(seconds)}`);
    const distance = logDistance(log);
    if (distance) metrics.push(`Distance ${distance.value} ${distanceLabel(distance.unitId)}`);
    const speed = logMaxSpeed(log);
    if (speed) {
        // Shown as stored; mph gets a km/h reading next to it, marked as a conversion
        const converted = speed.unitId === WEIGHT_UNIT_MPH ? ` (≈${(speed.value * MILES_TO_KM).toFixed(1)} km/h)` : "";
        metrics.push(`Max speed ${speed.value} ${speedLabel(speed.unitId)}${converted}`);
    }
    if (log.incline != null) metrics.push(`Incline ${log.incline}%`);
    if (log.level != null) metrics.push(`Level ${log.level}`);
    if (log.calories != null) metrics.push(`${log.calories} kcal`);
    // Their units were never declared, so none is made up here
    if (log.averageSpeed != null) metrics.push(`Avg speed ${log.averageSpeed}`);
    if (log.pace != null) metrics.push(`Pace ${log.pace}`);
    return metrics;
};

// The target of a planned set, e.g. "00:00:20" or "0.5 km"
export const primaryText = (value: number, unitId: number | null, unitName = "") => {
    if (unitId === REP_UNIT_SECONDS) return formatDuration(value);
    if (unitId === REP_UNIT_MINUTES) return formatDuration(value * 60);
    if (isDistanceUnit(unitId)) return `${value} ${distanceLabel(unitId)}`;
    return `${value} ${unitName && !/repetition/i.test(unitName) ? unitName.toLowerCase() : "reps"}`;
};

/*
 * The sets of an exercise in the last session before `current` that has it,
 * in recorded order. Without a current session, the last one overall.
 */
export const lastSessionLogs = (exerciseId: number, sessions: WorkoutSession[], current?: WorkoutSession | null) =>
    sessions
        .filter(session => session.id !== current?.id && (!current || session.datetimeStart < current.datetimeStart)
            && session.logs.some(entry => entry.exerciseId === exerciseId))
        .sort((a, b) => b.datetimeStart.getTime() - a.datetimeStart.getTime())[0]
        ?.logs.filter(entry => entry.exerciseId === exerciseId)
        .sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0)) ?? [];
