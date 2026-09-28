import { render, screen } from '@testing-library/react';
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { SessionDetail } from "@/components/Routines/widgets/WaveOne";
import { testWorkoutLogs, testWorkoutSession } from "@/tests/workoutLogsRoutinesTestData";
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const sessions = vi.hoisted(() => ({ current: { isLoading: true, data: undefined as WorkoutSession[] | undefined } }));
vi.mock('@/components/Routines/queries/sessions', () => ({ useSessionsQuery: () => sessions.current }));
vi.mock('@/components/Routines/queries/units', () => ({
    useFetchRoutineRepUnitsQuery: () => ({ data: [] }),
    useFetchRoutineWeighUnitsQuery: () => ({ data: [] }),
}));
vi.mock('@/components/Routines/widgets/LogWidgets', () => ({ ExerciseLog: () => <div>sets</div>, TimeSeriesChart: () => null }));
vi.mock('@/components/Routines/widgets/WaveThree', () => ({ ExerciseDemoLink: () => null, SessionMetadataEditor: () => null, SessionTimer: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

describe('SessionDetail', () => {
    // An "Edit sets" link opens the page on #edit, but the editor only renders once the sessions have loaded
    test('Scrolls to the set editor after the session loads when opened on #edit', () => {
        const scrolled: Element[] = [];
        Element.prototype.scrollIntoView = function (this: Element) {
            scrolled.push(this);
        };
        const id = testWorkoutSession.id!;
        const page = () => <MemoryRouter initialEntries={[`/en-au/routine/session/${id}#edit`]}>
            <Routes><Route path="/:lang/routine/session/:sessionId" element={<SessionDetail />} /></Routes>
        </MemoryRouter>;

        sessions.current = { isLoading: true, data: undefined };
        const view = render(page());
        expect(scrolled).toHaveLength(0);

        sessions.current = { isLoading: false, data: [new WorkoutSession({ ...testWorkoutSession, logs: testWorkoutLogs })] };
        view.rerender(page());

        expect(screen.getAllByText('sets').length).toBeGreaterThan(0);
        expect(scrolled.map(element => element.id)).toEqual(['edit']);
    });
});
