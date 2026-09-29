import { render, screen, waitFor } from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import { useDeleteRoutineLogQuery, useEditRoutineLogQuery } from '@/components/Routines/queries';
import { ExerciseLog, progressionSeries, TimeSeriesChart } from "@/components/Routines/widgets/LogWidgets";
import { testExerciseBenchPress } from "@/tests/exerciseTestdata";
import { testWorkoutLogs } from "@/tests/workoutLogsRoutinesTestData";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import type { Mock } from 'vitest';

vi.mock('@/components/Routines/queries', () => ({
    useDeleteRoutineLogQuery: vi.fn(),
    useEditRoutineLogQuery: vi.fn()
}));

describe('ExerciseLog', () => {
    let mockDeleteMutate: Mock;
    let mockEditMutate: Mock;

    beforeEach(() => {
        vi.clearAllMocks();

        mockDeleteMutate = vi.fn();
        mockEditMutate = vi.fn().mockResolvedValue(undefined);
        (useDeleteRoutineLogQuery as Mock).mockReturnValue({ mutate: mockDeleteMutate });
        (useEditRoutineLogQuery as Mock).mockReturnValue({ mutateAsync: mockEditMutate });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    const mockRoutineId = 123;
    const user = userEvent.setup();

    test('renders the DataGrid table correctly', () => {
        render(
            <ExerciseLog
                exercise={testExerciseBenchPress}
                routineId={mockRoutineId}
                logEntries={testWorkoutLogs}
            />
        );

        expect(screen.getByRole('grid')).toBeInTheDocument();
        expect(screen.getByText('Benchpress')).toBeInTheDocument();
        expect(mockDeleteMutate).not.toHaveBeenCalled();
        expect(mockEditMutate).not.toHaveBeenCalled();
    });

    test('calls deleteLogQuery when DeleteIcon is clicked', async () => {
        render(
            <ExerciseLog
                exercise={testExerciseBenchPress}
                routineId={mockRoutineId}
                logEntries={testWorkoutLogs}
            />
        );

        await user.click(screen.getAllByRole('menuitem', { name: /delete/i })[0]);
        expect(mockDeleteMutate).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-000000000005');
        expect(mockEditMutate).not.toHaveBeenCalled();

    });

    test('calls editLogQuery when SaveIcon is clicked', async () => {
        render(
            <ExerciseLog
                exercise={testExerciseBenchPress}
                routineId={mockRoutineId}
                logEntries={testWorkoutLogs}
            />
        );

        await user.click(screen.getAllByRole('menuitem', { name: /edit/i })[0]);
        await user.click(screen.getAllByRole('menuitem', { name: /save/i })[0]);

        expect(mockDeleteMutate).not.toHaveBeenCalled();
        await waitFor(() => expect(mockEditMutate).toHaveBeenCalled());
    });

    test('Editing one cardio value keeps every other stored value and unit', async () => {
        // An older ski erg set: 10 min primary, max speed held in weight as mph
        const legacy = new WorkoutLog({
            id: 'legacy', date: new Date('2024-05-01T10:00:00'), iteration: 1, exerciseId: 1946, slotEntryId: null, sessionId: 's', routineId: null,
            repetitionsUnitId: 4, repetitions: 10, weightUnitId: 6, weight: 8.5, rir: null,
            distance: 2.1, distanceUnitId: 6, incline: 0, calories: 120,
        });
        const { container } = render(<ExerciseLog exercise={testExerciseBenchPress} routineId={mockRoutineId} logEntries={[legacy]} />);

        // Shown as a speed with its stored unit, not as a load
        expect(screen.getByText('8.5 mph')).toBeInTheDocument();

        await user.click(screen.getByRole('menuitem', { name: /edit/i }));
        const calories = container.querySelector('[data-field="calories"] input') as HTMLInputElement;
        await user.clear(calories);
        await user.type(calories, '0');
        await user.click(screen.getByRole('menuitem', { name: /save/i }));

        await waitFor(() => expect(mockEditMutate).toHaveBeenCalled());
        const saved: WorkoutLog = mockEditMutate.mock.calls[0][0];
        expect(saved).toMatchObject({
            // Zero is a value, not "missing"
            calories: 0,
            repetitions: 10, repetitionUnitId: 4, weight: 8.5, weightUnitId: 6,
            distance: 2.1, distanceUnitId: 6, incline: 0, duration: null, maxSpeed: null, maxSpeedUnitId: null,
        });
    });

    test('A cleared legacy speed keeps the Weight cell locked while its unit is still mph', async () => {
        const legacy = new WorkoutLog({
            id: 'legacy', date: new Date('2024-05-01T10:00:00'), iteration: 1, exerciseId: 1946, slotEntryId: null, sessionId: 's', routineId: null,
            repetitionsUnitId: 4, repetitions: 10, weightUnitId: 6, weight: 8.5, rir: null,
        });
        const { container } = render(<ExerciseLog exercise={testExerciseBenchPress} routineId={mockRoutineId} logEntries={[legacy]} />);
        const weightInput = () => container.querySelector('[data-field="weight"] input');

        await user.click(screen.getByRole('menuitem', { name: /edit/i }));
        expect(weightInput()).toBeNull();
        await user.clear(container.querySelector('[data-field="maxSpeed"] input') as HTMLInputElement);
        await user.click(screen.getByRole('menuitem', { name: /save/i }));
        await waitFor(() => expect(mockEditMutate).toHaveBeenCalledTimes(1));
        expect(mockEditMutate.mock.calls[0][0]).toMatchObject({ weight: null, weightUnitId: 6, maxSpeed: null });

        // Emptied, the unit is still mph: no load can be typed in, a new speed stays an mph speed
        await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
        expect(weightInput()).toBeNull();
        // The emptied speed is still labelled in the unit it will be saved in
        const speedCell = container.querySelector('.MuiDataGrid-row--editing [data-field="maxSpeed"]')!;
        expect(speedCell).toHaveTextContent('mph');
        await user.type(speedCell.querySelector('input')!, '7');
        await user.click(screen.getByRole('menuitem', { name: /save/i }));
        await waitFor(() => expect(mockEditMutate).toHaveBeenCalledTimes(2));
        expect(mockEditMutate.mock.calls[1][0]).toMatchObject({ weight: 7, weightUnitId: 6, maxSpeed: null, maxSpeedUnitId: null });
        // Labelled in the unit it was saved in
        expect(await screen.findByText('7 mph')).toBeInTheDocument();
        expect(screen.queryByText('7 km/h')).toBeNull();
    });

    test('A rejected save keeps the cached log and the shown values, and the row stays open', async () => {
        mockEditMutate.mockRejectedValue(new Error('Server said no'));
        const log = new WorkoutLog({
            id: 'row', date: new Date('2024-05-01T10:00:00'), iteration: 1, exerciseId: 1946, slotEntryId: null, sessionId: 's', routineId: null,
            repetitionsUnitId: 1, repetitions: null, weightUnitId: 1, weight: null, rir: null, distance: 2.1, distanceUnitId: 6, calories: 120,
        });
        const { container } = render(<ExerciseLog exercise={testExerciseBenchPress} routineId={mockRoutineId} logEntries={[log]} />);

        await user.click(screen.getByRole('menuitem', { name: /edit/i }));
        const calories = container.querySelector('[data-field="calories"] input') as HTMLInputElement;
        await user.clear(calories);
        await user.type(calories, '300');
        await user.click(screen.getByRole('menuitem', { name: /save/i }));

        await waitFor(() => expect(mockEditMutate).toHaveBeenCalled());
        expect(mockEditMutate.mock.calls[0][0]).toMatchObject({ calories: 300, distance: 2.1 });
        // The log the queries cached is untouched; the row is still being edited, not shown as saved
        expect(log).toMatchObject({ calories: 120, distance: 2.1, distanceUnitId: 6 });
        expect(await screen.findByRole('menuitem', { name: /save/i })).toBeInTheDocument();
        expect(screen.queryByText('300')).not.toBeInTheDocument();
    });

    test('A value beyond the server precision is not sent and stays editable with a message', async () => {
        const log = new WorkoutLog({
            id: 'row', date: new Date('2024-05-01T10:00:00'), iteration: 1, exerciseId: 1946, slotEntryId: null, sessionId: 's', routineId: null,
            repetitionsUnitId: 1, repetitions: null, weightUnitId: 1, weight: null, rir: null, distance: 2.1, distanceUnitId: 6,
        });
        const { container } = render(<ExerciseLog exercise={testExerciseBenchPress} routineId={mockRoutineId} logEntries={[log]} />);

        await user.click(screen.getByRole('menuitem', { name: /edit/i }));
        const distance = container.querySelector('[data-field="distance"] input') as HTMLInputElement;
        await user.clear(distance);
        await user.type(distance, '1.2345');
        await user.click(screen.getByRole('menuitem', { name: /save/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Distance');
        expect(mockEditMutate).not.toHaveBeenCalled();
        expect(screen.getByRole('menuitem', { name: /save/i })).toBeInTheDocument();
    });
});

// sessionId, start, [repetitions, weight] per set; units default to repetitions and kg
const workout = (sessionId: string, start: Date, sets: [number | null, number | null][], units: { rep?: number, weight?: number } = {}) =>
    sets.map(([repetitions, weight], i) => new WorkoutLog({
        id: `${sessionId}-${i}`,
        date: start,
        iteration: 1,
        slotEntryId: null,
        sessionId,
        exerciseId: 1,
        repetitions,
        repetitionsUnitId: units.rep ?? 1,
        weight,
        weightUnitId: units.weight ?? 1,
        rir: null,
    }));

const points = (data: WorkoutLog[], metric: 'weight' | 'reps') =>
    progressionSeries(data, metric).series.map(([set, series]) => [set, series.map(point => point.value)]);

describe('progressionSeries', () => {
    test('A missing weight leaves a gap while a stored 0 kg is plotted', () => {
        const data = workout('a', new Date(2026, 0, 1), [[10, 20], [10, null], [10, 0]]);

        expect(points(data, 'weight')).toEqual([[1, [20]], [3, [0]]]);
    });

    test('Pounds become kilograms and body weight or plates are never charted as kg', () => {
        const data = [
            ...workout('lb', new Date(2026, 0, 1), [[10, 100]], { weight: 2 }),
            ...workout('plates', new Date(2026, 0, 2), [[10, 4]], { weight: 3 }),
            ...workout('kmh', new Date(2026, 0, 3), [[10, 12]], { weight: 5 }),
        ];

        expect(points(data, 'weight')).toEqual([[1, [45.359237]]]);
        expect(points(data, 'reps')).toEqual([[1, [10, 10, 10]]]);
    });

    test('Seconds and repetitions never share the reps axis; the newest unit wins', () => {
        const data = [
            ...workout('reps', new Date(2026, 0, 1), [[12, 0], [10, 0]]),
            ...workout('hold', new Date(2026, 0, 8), [[45, 0], [40, 0]], { rep: 3 }),
        ];

        const result = progressionSeries(data, 'reps');

        expect(result.repUnit).toBe('s');
        expect(result.mixedUnits).toBe(true);
        expect(points(data, 'reps')).toEqual([[1, [45]], [2, [40]]]);
        expect(result.ticks).toEqual([new Date(2026, 0, 8).getTime()]);
    });

    test('Two sessions on one day keep their own set numbers and dates', () => {
        const data = [
            ...workout('morning', new Date(2026, 0, 1, 7), [[5, 100], [5, 102.5]]),
            ...workout('evening', new Date(2026, 0, 1, 18), [[8, 80]]),
        ];

        const result = progressionSeries(data, 'weight');

        expect(points(data, 'weight')).toEqual([[1, [100, 80]], [2, [102.5]]]);
        expect(result.ticks).toHaveLength(2);
    });
});

describe('TimeSeriesChart', () => {
    beforeEach(() => window.localStorage.clear());

    test('Starts on kg when a load was lifted and can switch to reps', async () => {
        const user = userEvent.setup();
        render(<TimeSeriesChart data={workout('a', new Date(2023, 0, 10), [[8, 20], [8, null]])} />);

        expect(screen.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: 'Reps' }));
        expect(screen.getByRole('button', { name: 'Reps' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/No .* recorded/)).not.toBeInTheDocument();
    });

    test('Starts on reps for body weight sets and explains an empty kg chart', async () => {
        const user = userEvent.setup();
        render(<TimeSeriesChart data={workout('a', new Date(2026, 0, 10), [[15, null], [12, 0]])} />);

        expect(screen.getByRole('button', { name: 'Reps' })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: 'kg' }));
        // The stored 0 kg set is a real point, so the kg chart is not empty
        expect(screen.queryByText(/No kg recorded/)).not.toBeInTheDocument();
    });

    test('Explains a kg chart with no load at all', async () => {
        const user = userEvent.setup();
        render(<TimeSeriesChart data={workout('a', new Date(2026, 0, 10), [[15, null]])} />);

        await user.click(screen.getByRole('button', { name: 'kg' }));
        expect(screen.getByText('No kg recorded in the chart range (Last 6 sessions). Try Reps.')).toBeInTheDocument();
    });

    test('Points to the preference when the chosen range hides older workouts', () => {
        window.localStorage.setItem("wger.progressionChartRange", "6m");
        render(<TimeSeriesChart data={workout('a', new Date(2023, 0, 10), [[8, 20]])} />);

        expect(screen.getByText(/No sets in the chart range \(6 months\)/)).toBeInTheDocument();
    });

    test('Says when only one repetition unit is shown', () => {
        render(<TimeSeriesChart data={[
            ...workout('reps', new Date(2026, 0, 1), [[12, null]]),
            ...workout('hold', new Date(2026, 0, 8), [[45, null]], { rep: 3 }),
        ]} />);

        expect(screen.getByText('Only sets counted in s are shown; the others use a different unit.')).toBeInTheDocument();
    });
});