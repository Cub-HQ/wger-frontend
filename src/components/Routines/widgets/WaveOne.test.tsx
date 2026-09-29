import { render, screen, within } from '@testing-library/react';
import { ExerciseImage } from "@/components/Exercises/models/image";
import { Exercise } from "@/components/Exercises/models/exercise";
import { SetConfigData } from "@/components/Routines/models/SetConfigData";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { ExerciseProgression, SessionDetail, SessionSummary } from "@/components/Routines/widgets/WaveOne";
import { testExerciseBenchPress, testExerciseSquats } from "@/tests/exerciseTestdata";
import { testRepUnitRepetitions, testWeightUnitKg } from "@/tests/unitsTestData";
import { testWorkoutLogs, testWorkoutSession } from "@/tests/workoutLogsRoutinesTestData";
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const sessions = vi.hoisted(() => ({ current: { isLoading: true, data: undefined as WorkoutSession[] | undefined } }));
const routine = vi.hoisted(() => ({ requested: [] as [number, boolean | undefined][], config: null as unknown }));
vi.mock('@/components/Routines/queries/sessions', () => ({ useSessionsQuery: () => sessions.current }));
vi.mock('@/components/Routines/queries/routines', () => ({
    useRoutineDetailQuery: (id: number, enabled?: boolean) => {
        routine.requested.push([id, enabled]);
        return { data: enabled ? { getSetConfigData: () => routine.config } : undefined };
    },
}));
vi.mock('@/components/Routines/queries/units', () => ({
    useFetchRoutineRepUnitsQuery: () => ({ data: [] }),
    useFetchRoutineWeighUnitsQuery: () => ({ data: [] }),
}));
vi.mock('@/components/Routines/widgets/LogWidgets', () => ({ ExerciseLog: () => <div>sets</div>, TimeSeriesChart: ({ data }: { data: unknown[] }) => <div>chart of {data.length} sets</div> }));
vi.mock('@/components/Routines/widgets/WaveThree', () => ({ ExerciseDemoLink: () => null, SessionMetadataEditor: () => null, SessionTimer: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const page = (id: string, hash = '') => <MemoryRouter initialEntries={[`/en-au/routine/session/${id}${hash}`]}>
    <Routes><Route path="/:lang/routine/session/:sessionId" element={<SessionDetail />} /></Routes>
</MemoryRouter>;

const set = (sessionId: string, exercise: Exercise, iteration: number, repetitions: number, weight: number) => new WorkoutLog({
    id: `${sessionId}-${exercise.id}-${iteration}`,
    date: new Date(2025, 1, 10),
    iteration,
    exerciseId: exercise.id!,
    exercise,
    slotEntryId: exercise.id! * 10,
    sessionId,
    routineId: 3,
    repetitions,
    repetitionsUnit: testRepUnitRepetitions,
    weight,
    weightUnit: testWeightUnitKg,
    rir: null,
});

const bench = new Exercise({ ...testExerciseBenchPress, images: [new ExerciseImage(1, 'image', '/media/bench.jpg', true)] } as unknown as ConstructorParameters<typeof Exercise>[0]);

const summarySessions = () => {
    const previous = new WorkoutSession({ ...testWorkoutSession, id: 'previous', datetimeStart: new Date(2025, 1, 3, 10) });
    previous.logs = [set('previous', bench, 1, 8, 86.5), set('previous', bench, 2, 8, 87.5)];
    const current = new WorkoutSession({ ...testWorkoutSession, id: 'current' });
    // Stored out of order and interleaved, as the API may return them
    current.logs = [
        set('current', bench, 2, 8, 87.5),
        set('current', testExerciseSquats, 1, 5, 100),
        set('current', bench, 1, 16, 60),
        set('current', bench, 3, 5, 95),
        set('current', bench, 4, 4, 95),
    ];
    return [previous, current];
};

beforeEach(() => {
    routine.requested = [];
    routine.config = null;
});

describe('SessionSummary', () => {
    test('Groups the recorded sets under their exercise, next to the target and last time', () => {
        // The routine asks for 4 × 8; what was done is shown as it was recorded
        routine.config = new SetConfigData({ exerciseId: bench.id!, slotEntryId: 20, type: 'normal', nrOfSets: 4, repetitions: 8, repetitionsUnitId: 1, repetitionsUnit: testRepUnitRepetitions, repetitionsRounding: null, weightUnitId: 1, weightRounding: null, restTime: 90, textRepr: '', comment: '' });
        const all = summarySessions();
        render(<SessionSummary session={all[1]} sessions={all} />);

        const benchCard = screen.getByRole('region', { name: 'Benchpress' });
        expect(benchCard.querySelector('img')).toHaveAttribute('src', '/media/bench.jpg');
        expect(within(benchCard).getByText('Target: 4 sets × 8, 90s rest between sets')).toBeInTheDocument();
        const rows = within(benchCard).getAllByRole('listitem').map(row => row.textContent);
        expect(rows).toEqual([
            'Set 116 reps × 60 kg▼ -26.5 kg vs last time',
            'Set 28 reps × 87.5 kg',
            // Last time had two sets; the extra ones are held against the last of them
            'Set 35 reps × 95 kg▲ +7.5 kg vs last time',
            'Set 44 reps × 95 kg▲ +7.5 kg vs last time',
        ]);

        // Never done before: no comparison
        const squatCard = screen.getByRole('region', { name: 'Squats' });
        expect(within(squatCard).getAllByRole('listitem').map(row => row.textContent)).toEqual(['Set 15 reps × 100 kg']);
        expect(squatCard.querySelector('img')).toBeNull();
    });

    test('A workout without a routine shows no target', () => {
        const quick = new WorkoutSession({ ...testWorkoutSession, id: 'quick', routineId: null as unknown as number, logs: [set('quick', testExerciseSquats, 1, 5, 100)] });
        render(<SessionSummary session={quick} sessions={[quick]} />);

        expect(routine.requested.every(([, enabled]) => enabled === false)).toBe(true);
        expect(within(screen.getByRole('region', { name: 'Squats' })).queryByText(/Target/)).toBeNull();
    });

    test('A cardio set shows all its metrics on one row, apart from the time target', () => {
        const rower = new Exercise({ ...testExerciseSquats, id: 1093, translations: [] } as unknown as ConstructorParameters<typeof Exercise>[0]);
        // Planned 20 s; done 2:05, which two-decimal minutes can't hold, so it sits in duration
        routine.config = new SetConfigData({ exerciseId: 1093, slotEntryId: 30, type: 'normal', nrOfSets: 1, repetitions: 20, repetitionsUnitId: 3, repetitionsRounding: null, weightUnitId: 1, weightRounding: null, restTime: 30, textRepr: '', comment: '' });
        const row = new WorkoutLog({
            ...set('cardio', rower, 1, 0, 0), repetitions: null, repetitionsUnitId: 4, weight: 12.5, weightUnitId: 1,
            duration: 125, distance: 0.5, distanceUnitId: 6, maxSpeed: 14.2, maxSpeedUnitId: 5, incline: 0, level: 6, calories: 31.5,
        });
        // Older rows kept the max speed in weight; one in mph gets a marked km/h reading
        const legacy = new WorkoutLog({ ...set('cardio', rower, 2, 0, 0), repetitions: 10, repetitionsUnitId: 4, weight: 8.5, weightUnitId: 6 });
        const session = new WorkoutSession({ ...testWorkoutSession, id: 'cardio', logs: [row, legacy] });
        render(<SessionSummary session={session} sessions={[session]} />);

        const card = screen.getByRole('region', { name: 'Unknown exercise' });
        expect(within(card).getByText('Target: 1 set × 00:00:20, 30s rest between sets')).toBeInTheDocument();
        expect(within(card).getAllByRole('listitem').map(item => item.textContent)).toEqual([
            // The kg load stays a load, the max speed is its own km/h value; zero incline is shown
            'Set 1Load 12.5 · Time 00:02:05 · Distance 0.5 km · Max speed 14.2 km/h · Incline 0% · Level 6 · 31.5 kcal',
            'Set 2Time 00:10:00 · Max speed 8.5 mph (≈13.7 km/h)',
        ]);
    });
});

describe('SessionDetail', () => {
    // The read-only summary lives on the calendar; this page is for logging and editing
    test('Shows the set editor without a second, read-only summary', () => {
        sessions.current = { isLoading: false, data: summarySessions() };
        render(page('current'));

        expect(screen.queryByRole('region')).toBeNull();
        expect(screen.queryByText(/vs last time/)).toBeNull();
        expect(screen.getAllByText('sets')).toHaveLength(2);
        expect(screen.getByRole('link', { name: 'Edit workout sets' })).toHaveAttribute('href', '#edit');
    });

    // An "Edit sets" link opens the page on #edit, but the editor only renders once the sessions have loaded
    test('Scrolls to the set editor after the session loads when opened on #edit', () => {
        const scrolled: Element[] = [];
        Element.prototype.scrollIntoView = function (this: Element) {
            scrolled.push(this);
        };
        const id = testWorkoutSession.id!;

        sessions.current = { isLoading: true, data: undefined };
        const view = render(page(id, '#edit'));
        expect(scrolled).toHaveLength(0);

        sessions.current = { isLoading: false, data: [new WorkoutSession({ ...testWorkoutSession, logs: testWorkoutLogs })] };
        view.rerender(page(id, '#edit'));

        expect(screen.getAllByText('sets').length).toBeGreaterThan(0);
        expect(scrolled.map(element => element.id)).toEqual(['edit']);
    });
});

describe('ExerciseProgression', () => {
    const progression = (exerciseId: number) => <MemoryRouter initialEntries={['/en-au/exercise/1']}>
        <Routes><Route path="/:lang/exercise/:id" element={<ExerciseProgression exerciseId={exerciseId} />} /></Routes>
    </MemoryRouter>;
    // Two workouts in January 2023 and a different exercise in the second
    const oldHistory = () => {
        const first = new WorkoutSession({ ...testWorkoutSession, id: 'jan-a', datetimeStart: new Date(2023, 0, 10, 9) });
        first.logs = [1, 2, 3].map(i => set('jan-a', bench, i, 10, 20));
        const second = new WorkoutSession({ ...testWorkoutSession, id: 'jan-b', datetimeStart: new Date(2023, 0, 17, 9) });
        second.logs = [...[1, 2, 3].map(i => set('jan-b', bench, i, 10, 22.5)), set('jan-b', testExerciseSquats, 1, 5, 100)];
        return [first, second];
    };

    test('Charts and lists every set of an exercise last trained in 2023', () => {
        sessions.current = { isLoading: false, data: oldHistory() };
        render(progression(bench.id!));

        expect(screen.getByText('chart of 6 sets')).toBeInTheDocument();
        expect(screen.queryByText(/No recorded sets/)).toBeNull();
        const dates = screen.getAllByRole('link');
        expect(dates).toHaveLength(6);
        expect(dates[0]).toHaveTextContent('17/01/2023');
        expect(dates[0]).toHaveAttribute('href', '/en-au/routine/session/jan-b');
    });

    test('Shows the empty state only when this exercise has no sets', () => {
        sessions.current = { isLoading: false, data: oldHistory() };
        render(progression(9999));

        expect(screen.getByText('No recorded sets for this exercise yet.')).toBeInTheDocument();
        expect(screen.queryByText(/chart of/)).toBeNull();
    });
});
