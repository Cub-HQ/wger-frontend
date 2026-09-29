import { MeasurementCategory, MeasurementEntry } from "@/components/Measurements";
import {
    getAllMeasurementEntries,
    getMeasurementCategories
} from "@/components/Measurements/api/measurements";
import { getNutritionalDiaryEntries } from "@/components/Nutrition/api/nutritionalDiary";
import { getSessions } from "@/components/Routines/api/session";
import { deleteSession } from "@/components/Routines/api/sessionRecovery";
import { getRoutine } from "@/components/Routines/api/routine";
import { Exercise } from "@/components/Exercises/models/exercise";
import { ExerciseImage } from "@/components/Exercises/models/image";
import { Routine, SetConfigData, WorkoutLog, WorkoutSession } from "@/components/Routines";
import { testExerciseBenchPress, testExerciseSquats } from "@/tests/exerciseTestdata";
import { testRepUnitRepetitions, testWeightUnitKg } from "@/tests/unitsTestData";
import { getBodyWeightCategory, getWeights } from "@/components/Measurements/api/bodyWeight";
import { TEST_DIARY_ENTRY_1, TEST_DIARY_ENTRY_2 } from "@/tests/nutritionDiaryTestdata";
import { testQueryClient } from "@/tests/queryClient";
import {
    makeWeightEntry,
    TEST_BODY_WEIGHT_CATEGORY_UUID,
    testBodyWeightCategory
} from "@/tests/weight/testData";
import { testWorkoutSession } from "@/tests/workoutLogsRoutinesTestData";
import { dateToYYYYMMDD } from "@/core/lib/date";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import React from "react";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import type { Mock } from 'vitest';
import CalendarComponent from "./CalendarComponent";

vi.mock("@/components/Measurements/api/measurements");
vi.mock("@/components/Nutrition/api/nutritionalDiary");
vi.mock("@/components/Routines/api/session");
vi.mock("@/components/Routines/api/sessionRecovery");
vi.mock("@/components/Routines/api/routine");
vi.mock("@/components/Routines/api/workoutUnits", () => ({
    getRoutineRepUnits: () => Promise.resolve([testRepUnitRepetitions]),
    getRoutineWeightUnits: () => Promise.resolve([testWeightUnitKg]),
}));
vi.mock("@/components/Measurements/api/bodyWeight");
vi.mock('@/components/User/queries/profile', () => ({
    useProfileQuery: () => ({ isLoading: false, data: { useMetric: true } }),
}));


/*
 * The calendar renders relative to "today", so the clock is fixed to the middle of
 * a month. shouldAdvanceTime keeps the timers running, without it the queries never
 * resolve and the tests time out.
 */
describe('CalendarComponent', () => {
    // A Sunday, so the grid needs the maximum number of leading days
    const currentYear = 2024;
    const currentMonth = 11;
    const today = new Date(currentYear, currentMonth, 15, 12, 0);

    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(today);
        user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        (getBodyWeightCategory as Mock).mockImplementation(() => Promise.resolve(testBodyWeightCategory));
        (getWeights as Mock).mockImplementation(() => Promise.resolve([
            makeWeightEntry(new Date(currentYear, currentMonth, 2, 12, 0), 70),
        ]));

        (getSessions as Mock).mockImplementation(() => Promise.resolve(
            [testWorkoutSession]
        ));

        const group = new MeasurementCategory(
            'cccccccc-cccc-cccc-cccc-000000000002',
            "Blood pressure",
            "mmHg",
        );
        group.children = [new MeasurementCategory(
            'cccccccc-cccc-cccc-cccc-000000000003',
            "Systolic",
            "mmHg",
            'custom',
            false,
            group.id,
        )];
        (getMeasurementCategories as Mock).mockImplementation(() => Promise.resolve([
            new MeasurementCategory(
                'cccccccc-cccc-cccc-cccc-000000000001',
                "Body Fat",
                "%",
            ),
            group,
        ]));
        // the entries of the month, over all categories, which is where the
        // components of a group and the body weight arrive in as well
        (getAllMeasurementEntries as Mock).mockImplementation(() => Promise.resolve([
            new MeasurementEntry(
                'dddddddd-dddd-dddd-dddd-000000000001',
                'cccccccc-cccc-cccc-cccc-000000000001',
                new Date(currentYear, currentMonth, 1, 12, 0), 20, "Normal"
            ),
            new MeasurementEntry(
                'dddddddd-dddd-dddd-dddd-000000000002',
                'cccccccc-cccc-cccc-cccc-000000000003',
                new Date(currentYear, currentMonth, 1, 12, 0), 120, ""
            ),
            new MeasurementEntry(
                'dddddddd-dddd-dddd-dddd-000000000003',
                TEST_BODY_WEIGHT_CATEGORY_UUID,
                new Date(currentYear, currentMonth, 1, 12, 0), 65, ""
            ),
        ]));

        (getNutritionalDiaryEntries as Mock).mockImplementation(() => Promise.resolve([
            TEST_DIARY_ENTRY_1,
            TEST_DIARY_ENTRY_2,
        ]));

        testQueryClient.clear();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    const renderComponent = () => {
        render(
            <BrowserRouter>
                <I18nextProvider i18n={i18n}>
                    <QueryClientProvider client={testQueryClient}>
                        <CalendarComponent />
                    </QueryClientProvider>
                </I18nextProvider>
            </BrowserRouter>
        );
    };

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    test("renders calendar with days and header", () => {
        renderComponent();
        const days = screen.getAllByText(/^\d+$/);
        expect(days.length).toBeGreaterThan(getDaysInMonth(currentYear, currentMonth));

        expect(screen.getByText('December 2024')).toBeInTheDocument();

        // The week starts on monday
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((day) => {
            expect(screen.getByText(day)).toBeInTheDocument();
        });
    });

    test('pads the grid with the surrounding months so the columns line up', () => {
        renderComponent();

        // December 2024 starts on a sunday and ends on a tuesday, so the grid needs
        // six leading days from november and five trailing ones from january
        expect(screen.getByTestId('day-2024-11-25')).toBeInTheDocument();
        expect(screen.getByTestId('day-2024-12-01')).toBeInTheDocument();
        expect(screen.getByTestId('day-2024-12-31')).toBeInTheDocument();
        expect(screen.getByTestId('day-2025-01-05')).toBeInTheDocument();

        expect(screen.queryByTestId('day-2024-11-24')).not.toBeInTheDocument();
        expect(screen.queryByTestId('day-2025-01-06')).not.toBeInTheDocument();

        // 6 + 31 + 5, always full weeks
        const dayCells = screen.getAllByTestId(/^day-\d{4}-\d{2}-\d{2}$/);
        expect(dayCells).toHaveLength(42);
        expect(dayCells.length % 7).toBe(0);
    });

    test('does not navigate past the current month', () => {
        renderComponent();

        // Act - there is nothing to log in the future
        fireEvent.click(screen.getByText('>'));

        // Assert
        expect(screen.getByText('December 2024')).toBeInTheDocument();

        // ...but going back and forth again works
        fireEvent.click(screen.getByText('<'));
        expect(screen.getByText('November 2024')).toBeInTheDocument();
        fireEvent.click(screen.getByText('>'));
        expect(screen.getByText('December 2024')).toBeInTheDocument();
    });

    test('navigates to previous and next month', () => {
        renderComponent();

        const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const previousMonthName = previousMonthDate.toLocaleString('en-US', { month: 'long' });
        const previousMonthYear = previousMonthDate.getFullYear();

        fireEvent.click(screen.getByText('<'));
        expect(screen.getByText(`${previousMonthName} ${previousMonthYear}`)).toBeInTheDocument();

        fireEvent.click(screen.getByText('>'));
        const currentMonthName = today.toLocaleString('en-US', { month: 'long' });
        expect(screen.getByText(`${currentMonthName} ${currentYear}`)).toBeInTheDocument();
    });

    test('displays measurement details for selected day', async () => {
        // Arrange
        renderComponent();

        // Act
        const day = await screen.findByTestId(`day-${dateToYYYYMMDD(new Date(currentYear, currentMonth, 1))}`);
        await user.click(day);

        // more than one measurement, so they are behind the expander
        await user.click(await screen.findByText('measurements.measurements'));

        // Assert
        expect(await screen.findByText('Body Fat')).toBeInTheDocument();
        expect(screen.getByText(/20 %/i)).toBeInTheDocument();
        // the components of a group are categories of their own, and the only
        // place their readings can come from
        expect(screen.getByText('Systolic')).toBeInTheDocument();
        expect(screen.getByText(/120 mmHg/i)).toBeInTheDocument();
        // body weight has its own row on a day, it is not listed a second time
        expect(screen.queryByText(/65/)).toBeNull();
    });

    test('displays weight details for selected day', async () => {
        // Arrange
        renderComponent();

        // Act
        const day = await screen.findByTestId(`day-${dateToYYYYMMDD(new Date(currentYear, currentMonth, 2))}`);
        await user.click(day);

        // Assert
        expect(await screen.findByText('70.0 server.kg')).toBeInTheDocument();
    });

    test('reads the month as the instants it spans in the browser timezone', async () => {
        const start = new Date(currentYear, currentMonth, 1).toISOString();
        const end = new Date(currentYear, currentMonth + 1, 1).toISOString();

        renderComponent();
        await screen.findByTestId(`day-${dateToYYYYMMDD(new Date(currentYear, currentMonth, 1))}`);

        // A date bound would be read as midnight in the server's timezone and
        // leave out the entries of the last day
        expect(getWeights).toHaveBeenCalledWith(
            testBodyWeightCategory,
            { "date__gte": start, "date__lt": end },
        );
        expect(getAllMeasurementEntries).toHaveBeenCalledWith({ "date__gte": start, "date__lt": end });
        expect(getSessions).toHaveBeenCalledWith({
            filtersetQuerySessions: { "datetime_start__gte": start, "datetime_start__lt": end },
            filtersetQueryLogs: { "date__gte": start, "date__lt": end },
        });
        expect(getNutritionalDiaryEntries).toHaveBeenCalledWith({
            filtersetQuery: { "datetime__gte": start, "datetime__lt": end },
        });
    });

    describe('expanding a logged workout', () => {
        const bench = new Exercise({ ...testExerciseBenchPress, images: [new ExerciseImage(1, 'image', '/media/bench.jpg', true)] } as unknown as ConstructorParameters<typeof Exercise>[0]);
        const set = (sessionId: string, exercise: Exercise, iteration: number, repetitions: number, weight: number) => new WorkoutLog({
            id: `${sessionId}-${exercise.id}-${iteration}`,
            date: new Date(currentYear, currentMonth, 10),
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

        test('shows one card per exercise with its actions above the sets', async () => {
            const previous = WorkoutSession.clone(testWorkoutSession, { id: 'previous', datetimeStart: new Date(currentYear, currentMonth, 3, 10) });
            previous.logs = [set('previous', bench, 1, 6, 76.5), set('previous', bench, 2, 6, 50)];
            const current = WorkoutSession.clone(testWorkoutSession, { id: 'current', datetimeStart: new Date(currentYear, currentMonth, 10, 10, 30) });
            // Interleaved and out of order, as the API may return them
            current.logs = [
                set('current', bench, 2, 6, 50),
                set('current', testExerciseSquats, 1, 8, 40),
                set('current', bench, 1, 6, 50),
                set('current', testExerciseSquats, 2, 8, 40),
                set('current', bench, 3, 5, 55),
            ];
            (getSessions as Mock).mockImplementation(() => Promise.resolve([previous, current]));
            // The routine asks for 4 × 8 on the bench, nothing for the squats
            const config = new SetConfigData({ exerciseId: bench.id!, slotEntryId: 20, type: 'normal', nrOfSets: 4, repetitions: 8, repetitionsUnitId: 1, repetitionsUnit: testRepUnitRepetitions, repetitionsRounding: null, weightUnitId: 1, weightRounding: null, restTime: 90, textRepr: '', comment: '' });
            (getRoutine as Mock).mockResolvedValue({ getSetConfigData: (_day: number, _iteration: number, slotEntry: number) => slotEntry === bench.id! * 10 ? config : null } as unknown as Routine);

            renderComponent();
            await user.click(await screen.findByTestId(`day-${dateToYYYYMMDD(current.datetimeStart)}`));
            await user.click(await screen.findByText('routines.workoutSession'));

            const benchCard = await screen.findByRole('region', { name: 'Benchpress' });
            const squatCard = screen.getByRole('region', { name: 'Squats' });
            // Each exercise is named once, however many sets it had
            expect(screen.getAllByRole('heading', { name: 'Benchpress' })).toHaveLength(1);
            expect(screen.getAllByRole('heading', { name: 'Squats' })).toHaveLength(1);
            expect(benchCard.querySelector('img')).toHaveAttribute('src', '/media/bench.jpg');
            expect(await within(benchCard).findByText('Target: 4 sets × 8, 90s rest between sets')).toBeInTheDocument();
            expect(within(squatCard).queryByText(/Target/)).toBeNull();

            // What was done, in set order, each held against the same set last time
            expect(within(benchCard).getAllByRole('listitem').map(row => row.textContent)).toEqual([
                'Set 16 reps × 50 kg▼ -26.5 kg vs last time',
                'Set 26 reps × 50 kg',
                'Set 35 reps × 55 kg▲ +5 kg vs last time',
            ]);
            expect(within(squatCard).getAllByRole('listitem').map(row => row.textContent)).toEqual([
                'Set 18 reps × 40 kg',
                'Set 28 reps × 40 kg',
            ]);

            // The actions come before the first set, not after the last one
            for (const action of [
                screen.getByRole('link', { name: 'View workout' }),
                screen.getByRole('link', { name: 'Edit sets' }),
                screen.getByRole('button', { name: 'Delete workout' }),
            ]) {
                expect(action.compareDocumentPosition(benchCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            }
        });
    });

    describe('deleting a logged workout', () => {
        const logged = WorkoutSession.clone(testWorkoutSession, { datetimeStart: new Date(currentYear, currentMonth, 10, 10, 30) });
        let sessions: WorkoutSession[];

        beforeEach(() => {
            sessions = [logged];
            (getSessions as Mock).mockImplementation(() => Promise.resolve(sessions));
        });

        const openDelete = async () => {
            renderComponent();
            await user.click(await screen.findByTestId(`day-${dateToYYYYMMDD(logged.datetimeStart)}`));
            await user.click(await screen.findByText('routines.workoutSession'));
            // the delete sits next to the existing actions, which stay as they are
            expect(screen.getByRole('link', { name: 'View workout' })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Edit sets' })).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Delete workout' }));
            return screen.findByRole('dialog', { name: 'Delete workout?' });
        };

        test('cancel does not delete', async () => {
            const dialog = await openDelete();
            expect(within(dialog).getByText(/10\/12\/2024.*15 days/)).toBeInTheDocument();

            await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
            expect(deleteSession).not.toHaveBeenCalled();
            expect(screen.getByRole('link', { name: 'View workout' })).toBeInTheDocument();
        });

        test('sends one request and refreshes the calendar', async () => {
            let finish!: () => void;
            (deleteSession as Mock).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
            const dialog = await openDelete();
            const reads = (getSessions as Mock).mock.calls.length;
            const confirm = within(dialog).getByRole('button', { name: 'Delete workout' });

            fireEvent.click(confirm);
            fireEvent.click(confirm);

            await waitFor(() => expect(deleteSession).toHaveBeenCalledTimes(1));
            expect((deleteSession as Mock).mock.calls[0][0]).toBe(logged.id);
            expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
            sessions = [];
            finish();

            expect(await screen.findByRole('status')).toHaveTextContent('15 days');
            await waitFor(() => expect(screen.queryByText('routines.workoutSession')).toBeNull());
            expect((getSessions as Mock).mock.calls.length).toBeGreaterThan(reads);
            expect(deleteSession).toHaveBeenCalledTimes(1);
        });

        test('a failed delete keeps the workout', async () => {
            (deleteSession as Mock).mockRejectedValue(new Error('server refused'));
            const dialog = await openDelete();
            const reads = (getSessions as Mock).mock.calls.length;

            await user.click(within(dialog).getByRole('button', { name: 'Delete workout' }));

            expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete');
            await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
            expect(await screen.findByRole('link', { name: 'View workout' })).toBeInTheDocument();
            expect(getSessions).toHaveBeenCalledTimes(reads);
        });

        test('an unsaved session has no delete', async () => {
            sessions = [WorkoutSession.clone(logged, {})];
            sessions[0].id = null;
            renderComponent();
            await user.click(await screen.findByTestId(`day-${dateToYYYYMMDD(logged.datetimeStart)}`));
            await user.click(await screen.findByText('routines.workoutSession'));

            expect(screen.queryByRole('button', { name: 'Delete workout' })).toBeNull();
        });
    });
});