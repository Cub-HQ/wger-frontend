import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import type { AxiosStatic } from 'axios';
import { QueryKey } from '@/core/lib/consts';
import { RoutineOverview } from '@/components/Routines/screens/Overview/RoutineOverview';
import { RoutineDetailDropdown } from '@/components/Routines/widgets/RoutineDetailDropdown';
import { testRoutine1 } from '@/tests/workoutRoutinesTestData';

vi.mock('axios', async importOriginal => {
    const actual = await importOriginal<{ default: AxiosStatic }>();
    return { default: { ...actual.default, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});
vi.mock('@/core/ui/Widgets/Container', () => ({
    WgerContainerRightSidebar: ({ mainContent, optionsMenu }: { mainContent: React.ReactNode, optionsMenu?: React.ReactNode }) => <main>{optionsMenu}{mainContent}</main>,
}));
vi.mock('@/components/Routines/widgets/RoutineImportDialog', () => ({ RoutineImportDialog: () => null }));

const httpError = (status: number, data: object = {}) => new axios.AxiosError('failed', String(status), undefined, undefined,
    { status, data, statusText: '', headers: {}, config: { headers: new axios.AxiosHeaders() } });

const trashed = {
    recovery_id: 'rec-trash', routine_id: 1, routine_name: 'Test routine 1', operation: 'trash',
    created_at: '2026-09-30T10:00:00Z', expires_at: '2026-10-14T10:00:00Z', restorable: true, replacement_routine_id: null,
};
const edited = { ...trashed, recovery_id: 'rec-edit', routine_id: 5, routine_name: 'Push pull', operation: 'edit' };
const restored = { ...trashed, recovery_id: 'rec-old', routine_id: 6, routine_name: 'Old plan', restorable: false, restored_at: '2026-09-30T11:00:00Z' };
const restoreRow = { ...restored, recovery_id: 'rec-restore', operation: 'restore', restored_at: null };
const receipt = { routine_id: 1, recovery_id: 'rec-trash', operation: 'trash', deleted_at: trashed.created_at, expires_at: trashed.expires_at, revision: 'r2' };

let active: object[];
let recoveries: object[];
let client: QueryClient;

beforeEach(() => {
    // Also drops queued once-results a failed test left behind
    vi.resetAllMocks();
    active = [{ id: 1, name: 'Test routine 1', description: '', start: '2026-09-01', end: '2026-10-30', is_template: false, is_public: false }];
    recoveries = [edited, restored, restoreRow];
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
        if (url.includes('/routine/recoveries/')) return { data: { count: recoveries.length, next: null, previous: null, results: recoveries } };
        if (/\/routine\/\d+\/revision\/$/.test(url)) return { data: { routine_id: 1, revision: 'r1' } };
        return { data: { count: active.length, next: null, previous: null, results: active } };
    });
});

const show = (initialPath: string) => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/:lang/routine/overview" element={<RoutineOverview />} />
                <Route path="/:lang/routine/:id/view" element={<RoutineDetailDropdown routine={testRoutine1} />} />
            </Routes>
        </MemoryRouter>
    </QueryClientProvider>);
};

const confirmTrash = async () => {
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(await screen.findByText('Move to Trash'));
    const dialog = await screen.findByRole('dialog', { name: 'Move to Trash?' });
    expect(within(dialog).getByText(/14 days/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Logged workouts stay in your history/)).toBeInTheDocument();
    return dialog;
};

describe('routine trash and recovery', () => {
    test('trash never hard-deletes, sends revision + key, then offers Undo on the overview', async () => {
        vi.mocked(axios.post).mockImplementation(async (url: string) => {
            if (url.endsWith('/routine/1/trash/')) { active = []; recoveries = [trashed, edited, restored, restoreRow]; return { data: receipt }; }
            active = [{ id: 1, name: 'Test routine 1', description: '', start: '2026-09-01', end: '2026-10-30', is_template: false, is_public: false }];
            recoveries = [edited, restored, restoreRow];
            return { data: { routine_id: 1, revision: 'r3', restored_from: 'rec-trash' } };
        });
        show('/en/routine/1/view');
        const dialog = await confirmTrash();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));

        const undo = await screen.findByRole('button', { name: 'Undo' });
        expect(axios.delete).not.toHaveBeenCalled();
        const [url, body] = vi.mocked(axios.post).mock.calls[0];
        expect(url).toMatch(/\/api\/v2\/routine\/1\/trash\/$/);
        expect(body).toEqual({ expected_revision: 'r1', idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/) });
        expect(undo.closest('[role=status]')).toHaveTextContent('Test routine 1 moved to Trash. You can restore it until 14/10/2026');
        // The trashed plan is gone from the active list, and listed in Trash
        await waitFor(() => expect(screen.queryByRole('link', { name: /Test routine 1/ })).toBeNull());
        expect(await screen.findByRole('article', { name: /Test routine 1 — moved to Trash/ })).toBeInTheDocument();

        fireEvent.click(undo);
        expect(await screen.findByText('Test routine 1 is back in your routines.')).toBeInTheDocument();
        const [restoreUrl, restoreBody] = vi.mocked(axios.post).mock.calls[1];
        expect(restoreUrl).toMatch(/\/routine\/recoveries\/rec-trash\/restore\/$/);
        expect(restoreBody).toEqual({ expected_revision: 'r1', idempotency_key: expect.any(String) });
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    });

    test('a network failure keeps the same idempotency key on retry; a 409 conflict drops it', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce(new axios.AxiosError('Network Error'))
            .mockRejectedValueOnce(httpError(409, { detail: 'stale revision' }))
            .mockResolvedValueOnce({ data: receipt });
        show('/en/routine/1/view');
        const dialog = await confirmTrash();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
        expect(await within(dialog).findByText(/retrying never trashes twice/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
        expect(await within(dialog).findByText(/changed since you opened it/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
        await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(3));

        const keys = vi.mocked(axios.post).mock.calls.map(([, body]) => (body as { idempotency_key: string }).idempotency_key);
        expect(keys[1]).toBe(keys[0]);
        expect(keys[2]).not.toBe(keys[0]);
        // A new attempt after a conflict fetches a fresh revision
        expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).endsWith('/routine/1/revision/'))).toHaveLength(2);
    });

    test('cancel never trashes', async () => {
        show('/en/routine/1/view');
        const dialog = await confirmTrash();
        fireEvent.click(within(dialog).getByRole('button', { name: 'cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(axios.post).not.toHaveBeenCalled();
        expect(axios.delete).not.toHaveBeenCalled();
    });

    test('a double click sends one trash request', async () => {
        const { promise, resolve } = Promise.withResolvers<{ data: typeof receipt }>();
        vi.mocked(axios.post).mockReturnValue(promise);
        show('/en/routine/1/view');
        const dialog = await confirmTrash();
        const button = within(dialog).getByRole('button', { name: 'Move to Trash' });
        fireEvent.click(button);
        fireEvent.click(button);
        await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
        await act(async () => { resolve({ data: receipt }); });
    });

    test('Trash lists restorable and already restored entries; only restorable ones offer Restore', async () => {
        show('/en/routine/overview');
        const edit = await screen.findByRole('article', { name: /Push pull — version before the edit/ });
        expect(within(edit).getByText(/Restorable until/)).toBeInTheDocument();
        expect(within(edit).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
        const old = screen.getByRole('article', { name: /Old plan — moved to Trash/ });
        expect(within(old).getByText(/^Restored /)).toBeInTheDocument();
        expect(within(old).queryByRole('button', { name: 'Restore' })).toBeNull();
        // A 'restore' row has no redo, so it isn't offered at all
        expect(screen.queryByRole('article', { name: /restored 30/ })).toBeNull();
        // Completed history of a trashed plan stays reachable
        expect(within(old).getByRole('link', { name: 'Logged workouts' }).getAttribute('href')).toBe('/en/routine/6/logs');
    });

    test('restore conflict and expiry report clearly and refresh the list; retry reuses the key', async () => {
        vi.mocked(axios.post)
            .mockRejectedValueOnce(new axios.AxiosError('Network Error'))
            .mockRejectedValueOnce(httpError(409, { detail: 'Plan changed.', code: 'stale_revision', current_revision: 'r7' }))
            .mockRejectedValueOnce(httpError(410, { detail: 'Expired.', code: 'recovery_expired' }));
        show('/en/routine/overview');
        const edit = await screen.findByRole('article', { name: /Push pull/ });
        fireEvent.click(within(edit).getByRole('button', { name: 'Restore' }));
        const dialog = await screen.findByRole('dialog', { name: 'Restore earlier version?' });
        expect(within(dialog).getByText(/current plan is kept as a previous version for 14 days/)).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
        expect(await within(dialog).findByText(/retrying never restores twice/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText(/Nothing was restored. Undo the newer change first/)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const [first, second] = vi.mocked(axios.post).mock.calls.map(([, body]) => body as { idempotency_key: string, expected_revision: string });
        expect(second.idempotency_key).toBe(first.idempotency_key);
        expect(first.expected_revision).toBe('r1');

        fireEvent.click(within(screen.getByRole('article', { name: /Push pull/ })).getByRole('button', { name: 'Restore' }));
        const again = await screen.findByRole('dialog');
        fireEvent.click(within(again).getByRole('button', { name: 'Restore' }));
        expect(await screen.findByText(/its 14 days have passed. Your logged workouts are not affected/)).toBeInTheDocument();
        const third = vi.mocked(axios.post).mock.calls[2][1] as { idempotency_key: string };
        expect(third.idempotency_key).not.toBe(first.idempotency_key);
    });

    test('a foreign or unknown recovery (404) is refused without leaking details', async () => {
        vi.mocked(axios.post).mockRejectedValueOnce(httpError(404, { detail: 'Not found.' }));
        show('/en/routine/overview');
        fireEvent.click(within(await screen.findByRole('article', { name: /Push pull/ })).getByRole('button', { name: 'Restore' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore' }));
        expect(await screen.findByText('This is not available to restore. You can only restore your own routines.')).toBeInTheDocument();
    });

    test('restoring a rebuild checks the revision of the replacement routine', async () => {
        recoveries = [{ ...edited, recovery_id: 'rec-rebuild', operation: 'rebuild', replacement_routine_id: 9 }];
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { routine_id: 5, revision: 'r9', restored_from: 'rec-rebuild', recovery_id: 'rec-r', expires_at: trashed.expires_at } });
        show('/en/routine/overview');
        fireEvent.click(within(await screen.findByRole('article', { name: /Push pull — version before the rebuild/ })).getByRole('button', { name: 'Restore' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore' }));
        expect(await screen.findByText('Push pull was restored to the earlier version.')).toBeInTheDocument();
        expect(vi.mocked(axios.get).mock.calls.some(([url]) => String(url).endsWith('/routine/9/revision/'))).toBe(true);
    });

    test('a successful restore refreshes active plans and the calendar', async () => {
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { routine_id: 5, revision: 'r9', restored_from: 'rec-edit' } });
        show('/en/routine/overview');
        await screen.findByRole('article', { name: /Push pull/ });
        client.setQueryData([QueryKey.SESSIONS_FULL], ['cached']);
        client.setQueryData([QueryKey.ROUTINE_DETAIL, 5], 'cached');
        fireEvent.click(within(screen.getByRole('article', { name: /Push pull/ })).getByRole('button', { name: 'Restore' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore' }));
        expect(await screen.findByText('Push pull was restored to the earlier version.')).toBeInTheDocument();
        expect(client.getQueryState([QueryKey.SESSIONS_FULL])?.isInvalidated).toBe(true);
        expect(client.getQueryState([QueryKey.ROUTINE_DETAIL, 5])?.isInvalidated).toBe(true);
    });
});
