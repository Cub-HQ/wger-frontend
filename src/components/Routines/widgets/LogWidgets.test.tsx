import { render, screen, waitFor } from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import { useDeleteRoutineLogQuery, useEditRoutineLogQuery } from '@/components/Routines/queries';
import { ExerciseLog } from "@/components/Routines/widgets/LogWidgets";
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