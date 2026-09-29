import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from '@testing-library/react';
import axios from "axios";
import { RoutineDetail } from "@/components/Routines/screens/Detail/RoutineDetail";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getLanguages } from "@/components/Exercises/api/language";
import { getRoutine } from "@/components/Routines/api/routine";
import { Routine } from "@/components/Routines/models/Routine";
import { RoutineDayData } from "@/components/Routines/models/RoutineDayData";
import { SetConfigData } from "@/components/Routines/models/SetConfigData";
import { SlotData } from "@/components/Routines/models/SlotData";
import { dateToYYYYMMDD, shiftDays } from "@/core/lib/date";
import { testLanguages } from "@/tests/exerciseTestdata";
import { getTestQueryClient } from "@/tests/queryClient";
import { testDayLegs, testPrivateTemplate1, testRoutine1 } from "@/tests/workoutRoutinesTestData";
import type { Mock } from 'vitest';

vi.mock("@/components/Exercises/api/language");
vi.mock("@/components/Routines/api/routine");

describe("Smoke tests the RoutineDetail component", () => {

    beforeEach(() => {
        (getRoutine as Mock).mockResolvedValue(testRoutine1);
        (getLanguages as Mock).mockResolvedValue(testLanguages);
    });

    test('renders the detail page', async () => {

        // Act
        render(
            <QueryClientProvider client={getTestQueryClient()}>
                <MemoryRouter initialEntries={['/test/101']}>
                    <Routes>
                        <Route path="/test/:routineId" element={<RoutineDetail />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );

        // Assert
        await waitFor(() => {
            expect(getRoutine).toHaveBeenCalledWith(101);
            expect(getLanguages).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(screen.getByText('Test routine 1')).toBeInTheDocument();
        });

        expect(screen.queryByText('routines.template')).not.toBeInTheDocument();
        expect(screen.getByText('Full body routine')).toBeInTheDocument();
        expect(screen.getByText('Every day is leg day 🦵🏻')).toBeInTheDocument();
        expect(screen.getByText('Squats')).toBeInTheDocument();
        expect(screen.getByText('4 Sets, 5 x 20 @ 2Rir')).toBeInTheDocument();
    });

    test('renders chip for templates', async () => {
        (getRoutine as Mock).mockResolvedValue(testPrivateTemplate1);

        // Act
        render(
            <QueryClientProvider client={getTestQueryClient()}>
                <MemoryRouter initialEntries={['/test/101']}>
                    <Routes>
                        <Route path="/test/:routineId" element={<RoutineDetail />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );

        // Assert
        await waitFor(() => {
            expect(getRoutine).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(screen.getByText('routines.template')).toBeInTheDocument();
        });
    });
});

describe("RoutineDetail planned occurrence link (?day=&date=)", () => {
    const today = new Date();
    const nextWeek = shiftDays(today, 7);
    const plannedDay = (iteration: number, date: Date, textRepr: string) => new RoutineDayData(
        iteration,
        date,
        '',
        testDayLegs,
        [new SlotData('', false, [345], [new SetConfigData({
            exerciseId: 345,
            slotEntryId: 1,
            type: 'normal',
            nrOfSets: 3,
            weightUnitId: 1,
            weightRounding: 1.25,
            repetitionsUnitId: 1,
            repetitionsRounding: 1,
            textRepr: textRepr,
            comment: '',
        })])],
    );
    const routine = new Routine({
        id: 101,
        name: 'Synthetic routine',
        start: shiftDays(today, -7),
        end: shiftDays(today, 21),
        days: [testDayLegs],
        dayData: [plannedDay(1, today, 'current target'), plannedDay(2, nextWeek, 'future target')],
    });

    let writes: Mock[];
    beforeEach(() => {
        (getRoutine as Mock).mockResolvedValue(routine);
        (getLanguages as Mock).mockResolvedValue(testLanguages);
        writes = (['post', 'put', 'patch', 'delete'] as const).map(m => vi.spyOn(axios, m) as unknown as Mock);
    });
    afterEach(() => vi.restoreAllMocks());

    const renderAt = async (query: string) => {
        render(
            <QueryClientProvider client={getTestQueryClient()}>
                <MemoryRouter initialEntries={[`/test/101${query}`]}>
                    <Routes>
                        <Route path="/test/:routineId" element={<RoutineDetail />} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );
        await screen.findByText('Synthetic routine');
    };

    const expectNoWritesOrLogLinks = () => {
        writes.forEach(write => expect(write).not.toHaveBeenCalled());
        expect(document.querySelector('a[href*="add-logs"]')).toBeNull();
    };

    test('without a query shows the current iteration', async () => {
        await renderAt('');

        expect(screen.getByText('current target')).toBeInTheDocument();
        expect(screen.queryByText('future target')).not.toBeInTheDocument();
        expect(screen.queryByText('routines.plannedOccurrenceUnavailable')).not.toBeInTheDocument();
    });

    test('selects a future occurrence with its own targets, read-only', async () => {
        await renderAt(`?day=${testDayLegs.id}&date=${dateToYYYYMMDD(nextWeek)}`);

        expect(screen.getByText('future target')).toBeInTheDocument();
        expect(screen.queryByText('current target')).not.toBeInTheDocument();
        expect(screen.getByText(/routines.iterationNr/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'routines.backToRoutine' })).toHaveAttribute('href', '/en/routine/101/view');
        expectNoWritesOrLogLinks();
    });

    test('selects today\'s occurrence', async () => {
        await renderAt(`?day=${testDayLegs.id}&date=${dateToYYYYMMDD(today)}`);

        expect(screen.getByText('current target')).toBeInTheDocument();
        expect(screen.queryByText('future target')).not.toBeInTheDocument();
        expectNoWritesOrLogLinks();
    });

    test.each([
        ['a day of another routine', `?day=999&date=${dateToYYYYMMDD(today)}`],
        ['a date the day is not scheduled on', `?day=${testDayLegs.id}&date=${dateToYYYYMMDD(shiftDays(today, 1))}`],
        ['a date outside the routine', `?day=${testDayLegs.id}&date=1999-01-01`],
        ['an impossible date', `?day=${testDayLegs.id}&date=2026-02-30`],
        ['a malformed date', `?day=${testDayLegs.id}&date=tomorrow`],
        ['a malformed day', `?day=5abc&date=${dateToYYYYMMDD(today)}`],
        ['a missing date', `?day=${testDayLegs.id}`],
    ])('shows unavailable, never another day, for %s', async (_, query) => {
        await renderAt(query);

        expect(screen.getByText('routines.plannedOccurrenceUnavailable')).toBeInTheDocument();
        expect(screen.queryByText('current target')).not.toBeInTheDocument();
        expect(screen.queryByText('future target')).not.toBeInTheDocument();
        expect(screen.queryByText(testDayLegs.name)).not.toBeInTheDocument();
        expectNoWritesOrLogLinks();
    });
});
