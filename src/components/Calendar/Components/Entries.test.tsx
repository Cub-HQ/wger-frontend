import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeasurementEntry } from "@/components/Measurements";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { testQueryClient } from "@/tests/queryClient";
import { makeWeightEntry } from "@/tests/weight/testData";
import React from 'react';
import { TEST_INGREDIENT_1 } from "@/tests/ingredientTestdata";
import { TEST_DIARY_ENTRY_1, TEST_DIARY_ENTRY_2 } from "@/tests/nutritionDiaryTestdata";
import { testWorkoutLogs, testWorkoutSession } from "@/tests/workoutLogsRoutinesTestData";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import { dateToLocale } from "@/core/lib/date";
import { DayProps } from './CalendarComponent';
import Entries from './Entries';
import i18n from 'i18next';

vi.mock("@/components/Measurements/api/bodyWeight");
vi.mock('@/components/User/queries/profile', () => ({
    useProfileQuery: () => ({ isLoading: false, data: { useMetric: true } }),
}));

describe('Entries Component', () => {
    const mockDate = new Date('2025-4-25');

    const mockWeightEntry: MeasurementEntry = makeWeightEntry(mockDate, 75.5);

    const defaultProps: DayProps = {
        date: mockDate,
        weightEntry: undefined,
        measurements: [],
        nutritionLogs: [],
        workoutSessions: []
    };

    test('Correctly shows date and title', () => {
        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={defaultProps} />
            </QueryClientProvider>
        );

        expect(screen.getByText(/entries/i)).toBeInTheDocument();
        expect(screen.getByText(dateToLocale(mockDate), { exact: false })).toBeInTheDocument();
    });

    test('Shows weight entry, if available', () => {
        const propsWithWeight = {
            ...defaultProps,
            weightEntry: mockWeightEntry
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithWeight} />
            </QueryClientProvider>
        );

        expect(screen.getByText('weight')).toBeInTheDocument();
        expect(screen.getByText('75.5 server.kg')).toBeInTheDocument();
    });

    test('Shows measurement directly, if theres only one entry', () => {
        const propsWithOneMeasurement = {
            ...defaultProps,
            measurements: [
                { name: 'Chest size', value: 95, unit: 'cm', date: mockDate }
            ]
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithOneMeasurement} />
            </QueryClientProvider>
        );

        expect(screen.getByText('measurements.measurements')).toBeInTheDocument();
        expect(screen.getByText('Chest size: 95 cm')).toBeInTheDocument();
    });

    test('Show measurements in a collapsible', async () => {
        const propsWithMultipleMeasurements = {
            ...defaultProps,
            measurements: [
                { name: 'Chest size', value: 95, unit: 'cm', date: mockDate },
                { name: 'Arm size', value: 35, unit: 'cm', date: mockDate }
            ]
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithMultipleMeasurements} />
            </QueryClientProvider>
        );

        // Initially only the header is visible
        expect(screen.getByText('measurements.measurements')).toBeInTheDocument();
        expect(screen.queryByText('Chest size')).not.toBeInTheDocument();
        expect(screen.queryByText('Arm size')).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByText('measurements.measurements'));

        expect(screen.queryByText('Chest size')).toBeInTheDocument();
        expect(screen.getByText('Arm size')).toBeInTheDocument();
    });

    test('Shows the workout session logs in a collapsible', async () => {
        const propsWithSession = {
            ...defaultProps,
            workoutSessions: [new WorkoutSession({ ...testWorkoutSession, logs: testWorkoutLogs })]
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithSession} />
            </QueryClientProvider>
        );

        // Initially only the session header with its summary is visible
        expect(screen.getByText('routines.workoutSession')).toBeInTheDocument();
        expect(screen.getByText(/everything is awesome/)).toBeInTheDocument();
        expect(screen.queryByText('8 × 80')).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByText('routines.workoutSession'));

        // One card for the exercise, its sets numbered underneath as "repetitions × weight"
        expect(screen.getAllByText('Squats')).toHaveLength(1);
        expect(screen.getByRole('region', { name: 'Squats' })).toBeInTheDocument();
        expect(screen.getByText(/^8 reps × 80 kg/)).toBeInTheDocument();
        expect(screen.getByText(/^8 reps × 82.5 kg/)).toBeInTheDocument();
    });

    test('Shows a cardio set with all its metrics on one calendar row', async () => {
        const erg = new WorkoutLog({
            ...testWorkoutLogs[0], id: 'erg', repetitionsUnitId: 3, repetitions: 1205, weightUnitId: 1, weight: null, rir: null,
            distance: 4.35, distanceUnitId: 6, maxSpeed: 16.5, maxSpeedUnitId: 5, incline: 0, level: 6, calories: 260,
        } as unknown as ConstructorParameters<typeof WorkoutLog>[0]);
        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={{ ...defaultProps, workoutSessions: [new WorkoutSession({ ...testWorkoutSession, logs: [erg] })] }} />
            </QueryClientProvider>
        );
        await userEvent.setup().click(screen.getByText('routines.workoutSession'));

        // Not "1205 reps": the seconds are a time, and the empty kg load is not shown
        expect(screen.getByText('Time 00:20:05 · Distance 4.35 km · Max speed 16.5 km/h · Incline 0% · Level 6 · 260 kcal')).toBeInTheDocument();
    });

    test('Links the session to its lowercase locale route', async () => {
        // i18next reports the gym's /en-au/ path as "en-AU", and <html lang> is empty there
        await i18n.changeLanguage('en-AU');
        try {
            render(
                <QueryClientProvider client={testQueryClient}>
                    <Entries selectedDay={{ ...defaultProps, workoutSessions: [new WorkoutSession({ ...testWorkoutSession, logs: testWorkoutLogs })] }} />
                </QueryClientProvider>
            );
            await userEvent.setup().click(screen.getByText('routines.workoutSession'));

            const id = testWorkoutSession.id;
            expect(screen.getByRole('link', { name: 'View workout' })).toHaveAttribute('href', `/en-au/routine/session/${id}`);
            expect(screen.getByRole('link', { name: 'Edit sets' })).toHaveAttribute('href', `/en-au/routine/session/${id}#edit`);
        } finally {
            await i18n.changeLanguage('en');
        }
    });

    test('Shows every session of the day', async () => {
        const propsWithSessions = {
            ...defaultProps,
            workoutSessions: [
                new WorkoutSession({ ...testWorkoutSession, notes: 'morning workout', logs: testWorkoutLogs }),
                new WorkoutSession({
                    ...testWorkoutSession,
                    id: 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002',
                    notes: 'evening workout',
                    logs: []
                }),
            ]
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithSessions} />
            </QueryClientProvider>
        );

        // Both are listed, and expanding one leaves the other closed
        expect(screen.getAllByText('routines.workoutSession')).toHaveLength(2);
        expect(screen.getByText(/morning workout/)).toBeInTheDocument();
        expect(screen.getByText(/evening workout/)).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByText(/morning workout/));

        expect(screen.getByText(/^8 reps × 80 kg/)).toBeInTheDocument();
    });

    test('Shows the nutrition diary entries in a collapsible', async () => {
        const propsWithNutrition = {
            ...defaultProps,
            nutritionLogs: [TEST_DIARY_ENTRY_1, TEST_DIARY_ENTRY_2]
        };

        render(
            <QueryClientProvider client={testQueryClient}>
                <Entries selectedDay={propsWithNutrition} />
            </QueryClientProvider>
        );

        // Initially only the header is visible
        expect(screen.getByText('nutrition.nutritionalDiary')).toBeInTheDocument();
        expect(screen.queryByText(TEST_INGREDIENT_1.name)).not.toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByText('nutrition.nutritionalDiary'));

        expect(screen.getByText(TEST_INGREDIENT_1.name)).toBeInTheDocument();
        expect(screen.getByText(`${TEST_DIARY_ENTRY_1.amount} nutrition.gramShort`)).toBeInTheDocument();
    });
});