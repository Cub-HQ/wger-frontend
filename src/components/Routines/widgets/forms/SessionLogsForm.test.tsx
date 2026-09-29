import { QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import { Exercise, useLanguageQuery } from "@/components/Exercises";
import { useAddRoutineLogsQuery, useRoutineDetailQuery, useSessionOfDay, useSessionsQuery } from "@/components/Routines/queries";
import { SessionLogsForm } from '@/components/Routines/widgets/forms/SessionLogsForm';
import { DateTime } from "luxon";
import { testExerciseSquats, testLanguages } from "@/tests/exerciseTestdata";
import { testWorkoutSession } from "@/tests/workoutLogsRoutinesTestData";
import { testRoutine1, testRoutineDayData1 } from "@/tests/workoutRoutinesTestData";
import { RoutineDayData } from "@/components/Routines/models/RoutineDayData";
import { Routine } from "@/components/Routines/models/Routine";
import { SetConfigData } from "@/components/Routines/models/SetConfigData";
import { SlotData } from "@/components/Routines/models/SlotData";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { RepetitionUnit } from "@/components/Routines/models/RepetitionUnit";
import { testWeightUnitKg } from "@/tests/unitsTestData";
import { testQueryClient } from "@/tests/queryClient";
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';

// The exercise demo link under each exercise needs a router and a query client
const render = (ui: React.ReactElement) => rtlRender(
    <QueryClientProvider client={testQueryClient}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
);


vi.mock("@/components/Exercises/queries");
vi.mock("@/components/Routines/queries");

describe('SessionLogsForm', () => {

    const mockUseLanguageQuery = useLanguageQuery as Mock;
    const mockAddLogsQuery = useAddRoutineLogsQuery as Mock;
    const mockRoutineDetailQuery = useRoutineDetailQuery as Mock;
    const mockUseSessionOfDay = useSessionOfDay as Mock;
    const mockUseSessionsQuery = useSessionsQuery as Mock;
    const mockMutateAsync = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockRoutineDetailQuery.mockReturnValue({
            isLoading: false,
            data: testRoutine1,
        });
        mockAddLogsQuery.mockReturnValue({
            isPending: false,
            data: {},
            mutateAsync: mockMutateAsync,
        });
        mockUseLanguageQuery.mockReturnValue({
            isLoading: false,
            data: testLanguages,
        });
        mockUseSessionOfDay.mockReturnValue({
            sessions: [testWorkoutSession],
            session: testWorkoutSession,
            isLoading: false,
            isSuccess: true,
        });
        // Feeds the "Previous: …" hint, none here
        mockUseSessionsQuery.mockReturnValue({ isLoading: false, data: [] });
    });


    test('renders correct exercises from routine', async () => {
        render(<SessionLogsForm
            dayId={5}
            routineId={1}
            selectedDate={DateTime.now()}
            chosenSessionId={null}
        />);

        expect(screen.getByText('Squats')).toBeInTheDocument();
    });

    test('submits with correct parameters', async () => {
        // Arrange
        const user = userEvent.setup();
        const originalData = {
            routine: 1,
            day: 5,
            exercise: 345,
            repetitions: 5,
            rir: 2,
            weight: 20,

        };
        const updatedData = {
            ...originalData,
            repetitions: "17",
            weight: "42",
        };

        // Act
        render(<SessionLogsForm
            dayId={5}
            routineId={1}
            selectedDate={DateTime.fromISO('2024-05-05T12:00:00')}
            chosenSessionId={null}
        />);

        const weightElements = screen.getAllByRole('textbox').filter(input => (input as HTMLInputElement).value === '20');
        await user.click(weightElements[0]);
        await user.clear(weightElements[0]);
        await user.type(weightElements[0], "42");

        const repsElements = screen.getAllByRole('textbox').filter(input => (input as HTMLInputElement).value === '5');
        await user.click(repsElements[0]);
        await user.clear(repsElements[0]);
        await user.type(repsElements[0], "17");
        await user.click(screen.getByRole('button', { name: /submit/i }));


        // Assert
        expect(mockMutateAsync.mock.calls[0][0].length).toEqual(4);
        expect(mockMutateAsync.mock.calls[0][0][0]).toMatchObject(updatedData);
        expect(mockMutateAsync.mock.calls[0][0][1]).toMatchObject(originalData);
        expect(mockMutateAsync.mock.calls[0][0][2]).toMatchObject(originalData);
        expect(mockMutateAsync.mock.calls[0][0][3]).toMatchObject(originalData);
    });

    test('writes the logs into the session the screen works on', async () => {
        // Arrange
        const user = userEvent.setup();

        // Act
        render(<SessionLogsForm
            dayId={5}
            routineId={1}
            selectedDate={DateTime.fromISO('2024-05-05T12:00:00')}
            chosenSessionId={testWorkoutSession.id}
        />);
        await user.click(screen.getByRole('button', { name: /submit/i }));

        // Assert
        // Without the id the server would sort the logs into a session by their
        // time, which is a guess as soon as the day holds more than one
        expect(mockMutateAsync.mock.calls[0][0][0].session).toEqual(testWorkoutSession.id);
    });

    test('add log action buttons works', async () => {
        // Arrange
        const user = userEvent.setup();

        // Act
        render(<SessionLogsForm
            dayId={5}
            routineId={1}
            selectedDate={DateTime.fromISO('2024-05-05T12:00:00')}
            chosenSessionId={null}
        />);
        await user.click(screen.getByTestId('AddIcon'));
        await user.click(screen.getByRole('button', { name: /submit/i }));

        // Assert - one more than before
        expect(mockMutateAsync.mock.calls[0][0].length).toEqual(5);
    });

    test('delete exercise action buttons works', async () => {
        // Arrange
        const user = userEvent.setup();

        // Act
        render(<SessionLogsForm
            dayId={5}
            routineId={1}
            selectedDate={DateTime.now()}
            chosenSessionId={null}
        />);
        await user.click(screen.getAllByTestId('DeleteOutlinedIcon')[0]);

        // Assert
        expect(screen.queryByText('Squats')).not.toBeInTheDocument();
    });

    describe('Cardio station (rower, 1 × 20 min planned)', () => {
        const rower = new Exercise({ ...testExerciseSquats, id: 1948, category: { id: 15, name: 'Cardio' } } as unknown as ConstructorParameters<typeof Exercise>[0]);
        const day = testRoutineDayData1[0];
        const config = new SetConfigData({
            exerciseId: 1948, slotEntryId: 9, type: 'normal', nrOfSets: 1, maxNrOfSets: null,
            weight: null, maxWeight: null, weightUnitId: 1, weightRounding: null, weightUnit: testWeightUnitKg,
            repetitions: 20, maxRepetitions: null, repetitionsUnitId: 4, repetitionsUnit: new RepetitionUnit(4, 'Minutes'), repetitionsRounding: null,
            rir: null, rpe: null, restTime: null, maxRestTime: null, textRepr: '', comment: '', exercise: rower,
        });
        const cardioRoutine = new Routine({ ...testRoutine1, dayData: [new RoutineDayData(day.iteration, day.date, '', day.day, [new SlotData('', false, [1948], [config], [rower])])] } as unknown as ConstructorParameters<typeof Routine>[0]);
        const previous = new WorkoutSession({ ...testWorkoutSession, id: 'earlier', datetimeStart: new Date('2024-04-28T10:00:00') });
        previous.logs = [new WorkoutLog({
            id: 'p1', date: new Date('2024-04-28T10:00:00'), iteration: 1, exerciseId: 1948, slotEntryId: 9, sessionId: 'earlier', routineId: 1,
            repetitionsUnitId: 4, repetitions: 18, weightUnitId: 1, weight: null, rir: null, distance: 4.2, distanceUnitId: 6, calories: 250,
        })];

        const renderRower = () => {
            mockRoutineDetailQuery.mockReturnValue({ isLoading: false, data: cardioRoutine });
            mockUseSessionsQuery.mockReturnValue({ isLoading: false, data: [previous, testWorkoutSession] });
            render(<SessionLogsForm dayId={day.day!.id!} routineId={1} selectedDate={DateTime.fromISO('2024-05-05T12:00:00')} chosenSessionId={null} />);
        };

        test('Target and last time are shown apart and never fill the inputs', () => {
            renderRower();

            expect(screen.getByText('Target: 00:20:00')).toBeInTheDocument();
            expect(screen.getByText('Previous: Time 00:18:00 · Distance 4.2 km · 250 kcal')).toBeInTheDocument();
            for (const label of ['routines.cardioTime', 'routines.cardioDistance', 'routines.cardioMaxSpeed', 'routines.cardioIncline', 'routines.cardioLevel', 'routines.cardioCalories']) {
                expect(screen.getByLabelText(label)).toHaveValue('');
            }
            // Strength inputs are not offered for the rower
            expect(screen.queryByLabelText('server.repetitions')).toBeNull();
        });

        test('One performed set is posted as ONE log carrying every metric', async () => {
            const user = userEvent.setup();
            renderRower();

            await user.type(screen.getByLabelText('routines.cardioTime'), '00:20:00');
            await user.type(screen.getByLabelText('routines.cardioDistance'), '4.35');
            await user.type(screen.getByLabelText('routines.cardioMaxSpeed'), '16.5');
            await user.type(screen.getByLabelText('routines.cardioIncline'), '0');
            await user.type(screen.getByLabelText('routines.cardioLevel'), '6');
            await user.type(screen.getByLabelText('routines.cardioCalories'), '260');
            await user.click(screen.getByRole('button', { name: /submit/i }));

            const posted = mockMutateAsync.mock.calls[0][0];
            expect(posted).toHaveLength(1);
            expect(posted[0]).toMatchObject({
                exercise: 1948, repetitions_unit: 4, repetitions: 20, repetitions_target: 20,
                // The max speed is its own km/h value, the kg load untouched and empty
                weight: null, max_speed: 16.5, max_speed_unit: 5,
                duration: null, distance: 4.35, distance_unit: 6, incline: 0, level: 6, calories: 260,
                average_speed: null, pace: null,
            });
        });

        test('A time two-decimal minutes cannot hold goes to duration, the target is kept', async () => {
            const user = userEvent.setup();
            renderRower();

            await user.type(screen.getByLabelText('routines.cardioTime'), '00:20:05');
            await user.click(screen.getByRole('button', { name: /submit/i }));

            expect(mockMutateAsync.mock.calls[0][0]).toEqual([expect.objectContaining({
                repetitions: null, duration: 1205, repetitions_target: 20, distance: null, calories: null,
            })]);
        });

        test('An untouched cardio set is not saved', async () => {
            const user = userEvent.setup();
            renderRower();
            await user.click(screen.getByRole('button', { name: /submit/i }));
            expect(mockMutateAsync.mock.calls[0][0]).toEqual([]);
        });
    });
});
