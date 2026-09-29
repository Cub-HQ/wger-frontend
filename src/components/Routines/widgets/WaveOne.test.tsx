import { render, screen, within } from '@testing-library/react';
import { ExerciseImage } from "@/components/Exercises/models/image";
import { Exercise } from "@/components/Exercises/models/exercise";
import { SetConfigData } from "@/components/Routines/models/SetConfigData";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { SessionDetail, SessionSummary } from "@/components/Routines/widgets/WaveOne";
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
vi.mock('@/components/Routines/widgets/LogWidgets', () => ({ ExerciseLog: () => <div>sets</div>, TimeSeriesChart: () => null }));
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
