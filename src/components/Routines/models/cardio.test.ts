import {
    cardioFieldsOf,
    EMPTY_CARDIO_INPUT,
    formatDuration,
    hasCardioMetrics,
    isCardioPlan,
    parseDuration,
    weightUnitIsSpeed,
    withDistance,
    withMaxSpeed,
    withTime
} from "@/components/Routines/models/cardio";
import { WorkoutLog, WorkoutLogAdapter } from "@/components/Routines/models/WorkoutLog";
import { testExerciseSquats } from "@/tests/exerciseTestdata";
import { Exercise } from "@/components/Exercises";

const MINUTES = 4;
const SECONDS = 3;
const REPETITIONS = 1;
const KM = 6;
const METERS = 8;

const log = (data: Partial<ConstructorParameters<typeof WorkoutLog>[0]> = {}) => new WorkoutLog({
    id: 1, date: new Date(2025, 0, 1), iteration: 1, exerciseId: 1, slotEntryId: null, sessionId: 's', routineId: null,
    repetitionsUnitId: REPETITIONS, repetitions: null, weightUnitId: 1, weight: null, rir: null,
    ...data,
} as ConstructorParameters<typeof WorkoutLog>[0]);

describe('parseDuration / formatDuration', () => {
    test('HH:MM:SS, MM:SS and plain seconds; invalid clock parts are rejected', () => {
        expect(parseDuration('01:02:03')).toBe(3723);
        expect(parseDuration('2:05')).toBe(125);
        expect(parseDuration('45')).toBe(45);
        expect(parseDuration('00:00:12.34')).toBe(12.34);
        expect(parseDuration('')).toBeNull();
        expect(parseDuration('1:60')).toBeNaN();
        expect(parseDuration('1:60:00')).toBeNaN();
        expect(parseDuration('1.5:00')).toBeNaN();
    });

    test('Splits in whole hundredths, so float minutes never read a second short', () => {
        // 0.99999999 min × 60 is 59.9999994 s: that is a minute, not 00:00:59
        expect(formatDuration(0.99999999 * 60)).toBe('00:01:00');
        expect(formatDuration(3723)).toBe('01:02:03');
        expect(formatDuration(12.34)).toBe('00:00:12.34');
        expect(formatDuration(0)).toBe('00:00:00');
    });
});

describe('Duplicate-measure routing', () => {
    const minutesPrimary = { ...log({ repetitionsUnitId: MINUTES }), repetitionUnitId: MINUTES };

    test('A time two-decimal minutes hold goes to the Minutes primary; one they cannot goes to duration', () => {
        expect(withTime(minutesPrimary, 600)).toEqual({ repetitions: 10, duration: null });
        expect(withTime(minutesPrimary, 90)).toEqual({ repetitions: 1.5, duration: null });
        // 2:05 is 2.08333… min: never rounded, the primary stays empty
        expect(withTime(minutesPrimary, 125)).toEqual({ repetitions: null, duration: 125 });
        expect(withTime({ ...minutesPrimary, repetitionUnitId: SECONDS }, 125)).toEqual({ repetitions: 125, duration: null });
        // A reps primary keeps its reps, the time is a separate metric
        expect(withTime({ ...minutesPrimary, repetitionUnitId: REPETITIONS, repetitions: 12 }, 125)).toEqual({ duration: 125 });
    });

    test('A distance in the primary unit goes to the primary, another unit to distance only', () => {
        const kmPrimary = { ...minutesPrimary, repetitionUnitId: KM };
        expect(withDistance(kmPrimary, 2.1, KM)).toEqual({ repetitions: 2.1, distance: null, distanceUnitId: null });
        expect(withDistance(kmPrimary, 500, METERS)).toEqual({ repetitions: null, distance: 500, distanceUnitId: METERS });
        // The primary holds two decimals below 10000; anything else stays in distance, never rounded
        expect(withDistance(kmPrimary, 0.163, KM)).toEqual({ repetitions: null, distance: 0.163, distanceUnitId: KM });
        expect(withDistance({ ...kmPrimary, repetitionUnitId: METERS }, 12000, METERS)).toEqual({ repetitions: null, distance: 12000, distanceUnitId: METERS });
        expect(withDistance(kmPrimary, null, KM)).toEqual({ repetitions: null, distance: null, distanceUnitId: null });
        expect(withDistance({ ...kmPrimary, repetitionUnitId: REPETITIONS }, 0, KM)).toEqual({ distance: 0, distanceUnitId: KM });
    });

    test('New max speed is km/h, independent of the kg load; a legacy speed is edited in place', () => {
        const strength = { ...minutesPrimary, weight: 20, weightUnitId: 1 };
        expect(withMaxSpeed(strength, 14.2)).toEqual({ maxSpeed: 14.2, maxSpeedUnitId: 5 });
        // mph logged in weight stays mph in weight; nothing is reinterpreted
        expect(withMaxSpeed({ ...strength, weight: 8.5, weightUnitId: 6 }, 9)).toEqual({ weight: 9 });
        // An mph max speed keeps its unit when edited
        expect(withMaxSpeed({ ...strength, maxSpeed: 8, maxSpeedUnitId: 6 }, 9)).toEqual({ maxSpeed: 9, maxSpeedUnitId: 6 });
        // A cleared mph speed keeps its unit: typed again it is an mph speed, not a new km/h one
        const cleared = { ...strength, weight: null, weightUnitId: 6 };
        expect(withMaxSpeed(cleared, 7)).toEqual({ weight: 7 });
        expect(weightUnitIsSpeed(cleared)).toBe(true);
        expect(weightUnitIsSpeed(strength)).toBe(false);
    });
});

describe('cardioFieldsOf', () => {
    test('Every metric of the set in one record; empty stays null, zero stays zero', () => {
        expect(cardioFieldsOf({ ...EMPTY_CARDIO_INPUT, time: '00:02:05', distance: '0.5', maxSpeed: '14.2', incline: '0', calories: '31.5' }, MINUTES)).toEqual({
            repetitions: null, repetitionUnitId: MINUTES, weight: null, weightUnitId: null,
            duration: 125, distance: 0.5, distanceUnitId: KM, maxSpeed: 14.2, maxSpeedUnitId: 5,
            incline: 0, level: null, calories: 31.5,
        });
    });
});

describe('Classification', () => {
    test('Strength logs without cardio keys are not cardio; legacy speeds and metric primaries are', () => {
        const plain = log({ repetitions: 8, weight: 60 });
        // Older fixtures and plain objects lack the keys entirely
        const bare = Object.assign(Object.create(WorkoutLog.prototype), { repetitions: 8, repetitionUnitId: REPETITIONS, weight: 60, weightUnitId: 1 }) as WorkoutLog;
        expect(hasCardioMetrics(plain)).toBe(false);
        expect(hasCardioMetrics(bare)).toBe(false);
        expect(hasCardioMetrics(log({ weight: 8.5, weightUnitId: 6 }))).toBe(true);
        expect(hasCardioMetrics(log({ repetitions: 20, repetitionsUnitId: SECONDS }))).toBe(true);
        expect(hasCardioMetrics(log({ incline: 0 }))).toBe(true);
    });

    test('Cardio category or a time/distance plan gets cardio inputs', () => {
        const cardio = new Exercise({ ...testExerciseSquats, category: { id: 15, name: 'Cardio' } } as unknown as ConstructorParameters<typeof Exercise>[0]);
        expect(isCardioPlan(cardio, REPETITIONS)).toBe(true);
        expect(isCardioPlan(testExerciseSquats, REPETITIONS)).toBe(false);
        expect(isCardioPlan(testExerciseSquats, MINUTES)).toBe(true);
        expect(isCardioPlan(testExerciseSquats, METERS)).toBe(true);
    });
});

describe('WorkoutLogAdapter cardio', () => {
    const adapter = new WorkoutLogAdapter();
    test('Decimal strings parse, "0.00" is zero, missing keys are null, and all round-trip', () => {
        const parsed = adapter.fromJson({
            id: 7, date: '2025-01-01T10:00:00Z', iteration: null, exercise: 1946, slot_entry: null, session: 's', routine: null,
            repetitions_unit: MINUTES, repetitions: null, weight_unit: 1, weight: '20.00', rir: null,
            duration: '125.00', distance: '0.500', distance_unit: KM, max_speed: '14.20', max_speed_unit: 5, incline: '0.00', level: '6.0', calories: null,
        });
        expect([parsed.duration, parsed.distance, parsed.maxSpeed, parsed.incline, parsed.level, parsed.calories, parsed.pace])
            .toEqual([125, 0.5, 14.2, 0, 6, null, null]);
        expect(parsed.weight).toBe(20);
        expect(adapter.toJson(parsed)).toMatchObject({
            weight: 20, weight_unit: 1, duration: 125, distance: 0.5, distance_unit: KM, max_speed: 14.2, max_speed_unit: 5,
            incline: 0, level: 6, calories: null, average_speed: null, pace: null,
        });
    });
});
