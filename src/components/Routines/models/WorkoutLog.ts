/* eslint-disable camelcase */

import { Exercise } from "@/components/Exercises";
import { RepetitionUnit } from "@/components/Routines/models/RepetitionUnit";
import { WeightUnit } from "@/components/Routines/models/WeightUnit";
import { Adapter } from "@/core/lib/Adapter";

import type { CardioInput } from "@/components/Routines/models/cardio";
// The cardio inputs come from CardioInput, all as typed; time is "HH:MM:SS"
export interface LogEntryForm extends CardioInput {
    clientKey: string;
    exercise: Exercise | null;
    repetitionsUnit: RepetitionUnit | null;
    weightUnit: WeightUnit | null;
    slotEntry: number | null;
    rir: number | string;
    rirTarget: number | string | null;
    repetitions: number | string;
    repetitionsTarget: number | string | null;
    weight: number | string;
    weightTarget: number | string | null;
    rest: number | string | null;
    restTarget: number | string | null;
}


export class WorkoutLog {
    public id: string;
    public date: Date;
    public iteration: number | null;
    public exerciseId: number;
    public slotEntryId: number | null;
    public sessionId: string | null;
    public routineId: number | null;

    public repetitionUnitObj: RepetitionUnit | null;
    public repetitionUnitId: number | null;
    public repetitions: number | null;
    public repetitionsTarget: number | null;

    public weightUnitObj: WeightUnit | null;
    public weightUnitId: number | null;
    public weight: number | null;
    public weightTarget: number | null;

    public rir: number | null;
    public rirTarget: number | null;

    public restTime: number | null;
    public restTimeTarget: number | null;

    // Cardio metrics. The primary measure stays in repetitions, these hold the
    // other ones: duration in seconds, distance in its own unit, the max speed
    // in km/h or mph. Level is the machine's unitless effort, not RiR/RPE.
    public averageSpeed: number | null;
    public pace: number | null;
    public incline: number | null;
    public calories: number | null;
    public duration: number | null;
    public distance: number | null;
    public distanceUnitId: number | null;
    public maxSpeed: number | null;
    public maxSpeedUnitId: number | null;
    public level: number | null;

    public exerciseObj?: Exercise;

    constructor(data: {
        id: string;
        date: Date | string;
        iteration: number | null;
        slotEntryId: number | null;
        sessionId?: string | null;
        routineId?: number | null;

        exercise?: Exercise;
        exerciseId: number;

        repetitionsUnit?: RepetitionUnit;
        repetitionsUnitId?: number | null;
        repetitions: number | null;
        repetitionsTarget?: number | null;

        weightUnit?: WeightUnit;
        weightUnitId?: number | null;
        weight: number | null;
        weightTarget?: number | null;

        rir: number | null;
        rirTarget?: number | null;

        restTime?: number | null;
        restTimeTarget?: number | null;

        averageSpeed?: number | null;
        pace?: number | null;
        incline?: number | null;
        calories?: number | null;
        duration?: number | null;
        distance?: number | null;
        distanceUnitId?: number | null;
        maxSpeed?: number | null;
        maxSpeedUnitId?: number | null;
        level?: number | null;
    }) {
        // Note that all of these use ?? and not ||: zero is a meaningful value here.
        // Training to failure is 0 RiR, a bodyweight exercise has a weight of 0 and
        // supersets are done with no rest in between.
        this.id = data.id;
        this.date = typeof data.date === 'string' ? new Date(data.date) : data.date;
        this.iteration = data.iteration;
        this.slotEntryId = data.slotEntryId;
        this.sessionId = data.sessionId ?? null;
        this.routineId = data.routineId ?? null;

        this.exerciseObj = data.exercise;
        this.exerciseId = data.exerciseId;

        this.repetitionUnitObj = data.repetitionsUnit ?? null;
        this.repetitionUnitId = data.repetitionsUnitId ?? null;
        this.repetitions = data.repetitions;
        this.repetitionsTarget = data.repetitionsTarget ?? null;

        this.weightUnitObj = data.weightUnit ?? null;
        this.weightUnitId = data.weightUnitId ?? null;
        this.weight = data.weight;
        this.weightTarget = data.weightTarget ?? null;

        this.rir = data.rir;
        this.rirTarget = data.rirTarget ?? null;

        this.restTime = data.restTime ?? null;
        this.restTimeTarget = data.restTimeTarget ?? null;

        this.averageSpeed = data.averageSpeed ?? null;
        this.pace = data.pace ?? null;
        this.incline = data.incline ?? null;
        this.calories = data.calories ?? null;
        this.duration = data.duration ?? null;
        this.distance = data.distance ?? null;
        this.distanceUnitId = data.distanceUnitId ?? null;
        this.maxSpeed = data.maxSpeed ?? null;
        this.maxSpeedUnitId = data.maxSpeedUnitId ?? null;
        this.level = data.level ?? null;
    }

    get rirString(): string {
        return this.rir === null ? "-/-" : this.rir.toString();
    }
}

// The API sends decimals as strings; a missing key reads as null, "0.00" as 0
const decimal = (value: unknown): number | null => value === null || value === undefined ? null : Number.parseFloat(String(value));

// The cardio part of a log in the API's keys, shared by the adapter and the forms
export const cardioJson = (item: Pick<WorkoutLog, 'averageSpeed' | 'pace' | 'incline' | 'calories' | 'duration' | 'distance' | 'distanceUnitId' | 'maxSpeed' | 'maxSpeedUnitId' | 'level'>) => ({
    average_speed: item.averageSpeed,
    pace: item.pace,
    incline: item.incline,
    calories: item.calories,
    duration: item.duration,
    distance: item.distance,
    distance_unit: item.distanceUnitId,
    max_speed: item.maxSpeed,
    max_speed_unit: item.maxSpeedUnitId,
    level: item.level,
});

export class WorkoutLogAdapter implements Adapter<WorkoutLog> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fromJson = (item: any) =>
        new WorkoutLog({
            id: item.id,
            date: item.date, // Pass the date string directly
            iteration: item.iteration,
            exerciseId: item.exercise,
            slotEntryId: item.slot_entry,
            sessionId: item.session,
            routineId: item.routine,

            repetitionsUnitId: item.repetitions_unit,
            repetitions: decimal(item.repetitions),
            repetitionsTarget: decimal(item.repetitions_target),

            weightUnitId: item.weight_unit,
            weight: decimal(item.weight),
            weightTarget: decimal(item.weight_target),

            rir: decimal(item.rir),
            rirTarget: decimal(item.rir_target),

            restTime: item.rest,
            restTimeTarget: item.rest_target,

            averageSpeed: decimal(item.average_speed),
            pace: decimal(item.pace),
            incline: decimal(item.incline),
            calories: decimal(item.calories),
            duration: decimal(item.duration),
            distance: decimal(item.distance),
            distanceUnitId: item.distance_unit ?? null,
            maxSpeed: decimal(item.max_speed),
            maxSpeedUnitId: item.max_speed_unit ?? null,
            level: decimal(item.level),
        });

    toJson = (item: WorkoutLog) => ({
        id: item.id,
        iteration: item.iteration,
        date: item.date.toISOString(),
        slot_entry: item.slotEntryId,
        exercise: item.exerciseId,
        session: item.sessionId,
        routine: item.routineId,

        repetitions_unit: item.repetitionUnitId,
        repetitions: item.repetitions,
        repetitions_target: item.repetitionsTarget,

        weight_unit: item.weightUnitId,
        weight: item.weight,
        weight_target: item.weightTarget,

        rir: item.rir,
        rir_target: item.rirTarget,

        rest: item.restTime,
        rest_target: item.restTimeTarget,

        ...cardioJson(item),
    });
}
