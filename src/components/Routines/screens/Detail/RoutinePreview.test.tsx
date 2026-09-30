import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { RoutinePreview } from './RoutinePreview';

vi.mock('axios', async importOriginal => {
    const actual = await importOriginal<typeof import('axios')>();
    return { default: { ...actual.default, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
vi.mock('@/core/ui/Widgets/Container', () => ({
    WgerContainerFullWidth: ({ title, children }: { title: string, children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}));

const UUID = '3f1c2a8e-0000-4000-8000-000000000026';
const set = (overrides: object) => ({
    slot_entry_id: 1, exercise: 2, sets: 4, max_sets: null, weight: '60', max_weight: null, weight_unit: 1,
    weight_rounding: null, repetitions: '8', max_repetitions: '10', repetitions_unit: 1, repetitions_rounding: null,
    rir: '1.5', max_rir: null, rpe: null, rest: 180, max_rest: null, type: 'normal', comment: '', text_repr: '', ...overrides,
});
const lower = { name: 'Mon Lower', description: 'Brace hard', is_rest: false, type: 'custom', need_logs_to_advance: false, config: null };
// Two program weeks: training Monday then a rest day, week 2 is a labelled deload
const payload = {
    preview_id: UUID,
    plan_hash: 'sha256:abc123def456',
    external_version: 'nath-v3',
    expires_at: '2099-01-01T00:00:00Z',
    canonical_proposal: { routine: { name: '12wk Strength', description: 'Proposal notes' } },
    exercise_names: { 2: 'Bench press', 3: 'Row' },
    schedule: [
        {
            iteration: 1, date: '2026-10-05', label: 'Block 1', day: lower, slots: [
                { comment: 'Pair these', is_superset: true, exercises: [2, 3], sets: [
                    set({ text_repr: '4 Sets, 8-10 × 60 kg @ 1.5 RiR 180s rest', comment: 'Pause at the bottom' }),
                    set({ exercise: 3, slot_entry_id: 2, text_repr: '3 Sets, 12 Reps' }),
                ] },
            ],
        },
        { iteration: 1, date: '2026-10-06', label: 'Travel', day: { ...lower, name: 'Tue rest', is_rest: true }, slots: [] },
        {
            iteration: 2, date: '2026-10-12', label: 'Deload', day: lower, slots: [
                { comment: '', is_superset: false, exercises: [2], sets: [set({ text_repr: '2 Sets, 8-10 × 50 kg' })] },
            ],
        },
    ],
};

const statusError = (status: number) => Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: { detail: 'secret' } } });
let previewResponse: () => Promise<{ data: unknown }>;

beforeEach(() => {
    previewResponse = async () => ({ data: payload });
    vi.mocked(axios.get).mockImplementation(() => previewResponse());
});
afterEach(() => vi.clearAllMocks());

function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/en/routine/preview/${UUID}/`]}>
            <Routes><Route path="/:lang/routine/preview/:previewId" element={<RoutinePreview />} /></Routes>
        </MemoryRouter>
    </QueryClientProvider>);
}

describe('RoutinePreview', () => {
    it('reads the owner preview and shows every week read-only with explicit targets, labels and version', async () => {
        show();
        expect(await screen.findByText('Proposal awaiting approval')).toBeInTheDocument();
        // One owner read and nothing else: names come with the preview
        expect(vi.mocked(axios.get).mock.calls.map(call => call[0])).toEqual([`https://example.com/api/v2/routine-preview/${UUID}/`]);
        expect(screen.getByText('sha256:abc123def456')).toBeInTheDocument();
        expect(screen.getByText(/nath-v3/)).toBeInTheDocument();

        const week1 = screen.getByRole('region', { name: 'Week 1' });
        const week2 = screen.getByRole('region', { name: 'Week 2' });
        expect(within(week1).getAllByText('Block 1').length).toBeGreaterThan(0);
        expect(within(week1).getByText('4 Sets, 8-10 × 60 kg @ 1.5 RiR 180s rest')).toBeInTheDocument();
        expect(within(week1).getByText('Superset')).toBeInTheDocument();
        expect(within(week1).getByText('Bench press')).toBeInTheDocument();
        expect(within(week1).getByText('Row')).toBeInTheDocument();
        expect(within(week1).getByText('Pair these')).toBeInTheDocument();
        expect(within(week1).getByText('Pause at the bottom')).toBeInTheDocument();
        expect(within(week1).getByText(/routines.restDay/)).toBeInTheDocument();
        // A week with more than one label shows each day's own label
        expect(within(screen.getByRole('article', { name: /06\/10\/2026/ })).getByText('Travel')).toBeInTheDocument();
        expect(within(screen.getByRole('article', { name: /05\/10\/2026/ })).getByText('Block 1')).toBeInTheDocument();
        expect(within(week2).getAllByText('Deload').length).toBeGreaterThan(0);
        expect(within(week2).getByText('2 Sets, 8-10 × 50 kg')).toBeInTheDocument();

        // No action or saved-routine link, and nothing but reads went out
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
        expect(axios.post).not.toHaveBeenCalled();
        expect(axios.patch).not.toHaveBeenCalled();
        expect(axios.delete).not.toHaveBeenCalled();
    });

    it.each([
        [401, 'Please log in'],
        [403, 'Please log in'],
        [404, 'Preview not found'],
        [410, 'Preview expired'],
        [500, 'Could not load preview'],
    ])('shows only a generic message for a %i response', async (status, title) => {
        previewResponse = async () => { throw statusError(status); };
        show();
        expect(await screen.findByRole('alert')).toHaveTextContent(title);
        expect(screen.queryByText('secret')).toBeNull();
        expect(screen.queryByText(UUID)).toBeNull();
        expect(screen.queryByRole('region')).toBeNull();
    });

    it('hides program data once the preview has expired even if the server still returned it', async () => {
        previewResponse = async () => ({ data: { ...payload, expires_at: '2000-01-01T00:00:00Z' } });
        show();
        expect(await screen.findByRole('alert')).toHaveTextContent('Preview expired');
        expect(screen.queryByText('12wk Strength')).toBeNull();
        expect(screen.queryByRole('region')).toBeNull();
    });
});
