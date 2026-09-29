import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import {
    confirmRoutineImport,
    ImportPreview,
    previewRoutineImport
} from "@/components/Routines/api/routine";
import { RoutineImportDialog } from "@/components/Routines/widgets/RoutineImportDialog";
import { QueryKey } from "@/core/lib/consts";
import { getTestQueryClient } from "@/tests/queryClient";
import { TEST_ROUTINES } from "@/tests/workoutRoutinesTestData";
import { AxiosError, AxiosHeaders } from "axios";
import i18n from "i18next";
import React from 'react';
import type { Mock } from 'vitest';

vi.mock("@/components/Routines/api/routine", async (importOriginal) => ({
    ...await importOriginal<object>(),
    previewRoutineImport: vi.fn(),
    confirmRoutineImport: vi.fn(),
    downloadRoutineSpreadsheet: vi.fn(),
}));

const okPreview: ImportPreview = {
    ok: true,
    plan_hash: 'hash-1',
    mode: 'create',
    routine: { id: null, name: 'Synthetic plan', description: '', start: '2026-01-05', end: '2026-02-01' },
    rows: [{ row: 2, status: 'ok', exercise: { how: 'name', id: 11, name: 'Bench press' } }],
    errors: [],
    diff: {
        create: { days: 1, slots: 1, entries: 1 },
        update: { days: 0, slots: 0, entries: 0 },
        delete: { days: 0, slots: 0, entries: 0 },
        blocked_deletes: [],
    },
    unsupported_dropped: [],
};

const httpError = (status: number, data: unknown) => new AxiosError(
    `Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined,
    { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } }
);

describe("RoutineImportDialog", () => {
    let user: ReturnType<typeof userEvent.setup>;
    let client: QueryClient;
    const fileA = new File(['routine_name\nA'], 'a.csv', { type: 'text/csv' });
    const fileB = new File(['routine_name\nB'], 'b.csv', { type: 'text/csv' });

    beforeAll(() => {
        i18n.addResourceBundle('en', 'translations', {
            routines: {
                spreadsheet: {
                    matchedBy_name: '{{name}} (#{{id}}, matched by name)',
                    matchAmbiguous: 'Ambiguous: {{candidates}}',
                }
            }
        }, true, true);
    });

    beforeEach(() => {
        vi.resetAllMocks();
        user = userEvent.setup();
        client = getTestQueryClient();
    });

    const renderDialog = () => render(
        <QueryClientProvider client={client}>
            <RoutineImportDialog open={true} onClose={vi.fn()} routines={TEST_ROUTINES} />
        </QueryClientProvider>
    );
    const pick = (file: File) => fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
    const previewButton = () => screen.getByRole('button', { name: 'routines.spreadsheet.preview' });
    const confirmButton = () => screen.getByRole('button', { name: 'routines.spreadsheet.confirm' });
    const chooseUpdateTarget = async () => {
        await user.click(screen.getByRole('button', { name: 'routines.spreadsheet.modeUpdate' }));
        await user.click(screen.getByRole('combobox'));
        await user.click(await screen.findByRole('option', { name: 'Test routine 1' }));
    };

    test('confirm needs a successful preview and applies exactly the previewed request', async () => {
        (previewRoutineImport as Mock).mockResolvedValue(okPreview);
        (confirmRoutineImport as Mock).mockResolvedValue({ id: 42, plan_hash: 'hash-1' });
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        renderDialog();

        expect(screen.getByText('routines.spreadsheet.planningOnly')).toBeInTheDocument();
        expect(previewButton()).toBeDisabled();
        pick(fileA);
        expect(confirmButton()).toBeDisabled();

        await user.click(previewButton());
        expect(await screen.findByText('Bench press (#11, matched by name)')).toBeInTheDocument();
        expect(confirmButton()).toBeEnabled();

        await user.click(confirmButton());

        expect(confirmRoutineImport).toHaveBeenCalledWith(
            { file: fileA, mode: 'create', routineId: null, dropUnsupported: false }, 'hash-1'
        );
        const open = await screen.findByRole('link', { name: 'routines.spreadsheet.openRoutine' });
        expect(open).toHaveAttribute('href', '/en/routine/42/view');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [QueryKey.ROUTINES_SHALLOW] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [QueryKey.ROUTINE_DETAIL, 42] });
        // Applied once; a second confirm needs a new preview
        expect(confirmButton()).toBeDisabled();
    });

    test('changing the file or the mode throws the preview away', async () => {
        (previewRoutineImport as Mock).mockResolvedValue(okPreview);
        renderDialog();
        pick(fileA);
        await user.click(previewButton());
        await waitFor(() => expect(confirmButton()).toBeEnabled());

        pick(fileB);
        expect(confirmButton()).toBeDisabled();
        expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();

        await user.click(previewButton());
        await waitFor(() => expect(confirmButton()).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'routines.spreadsheet.modeUpdate' }));
        expect(confirmButton()).toBeDisabled();
    });

    test('a preview answering an older file never enables confirm', async () => {
        const first = Promise.withResolvers<ImportPreview>();
        (previewRoutineImport as Mock).mockReturnValueOnce(first.promise);
        renderDialog();
        pick(fileA);
        await user.click(previewButton());

        pick(fileB);
        first.resolve(okPreview);

        await waitFor(() => expect(previewButton()).toBeEnabled());
        expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();
        expect(confirmButton()).toBeDisabled();
    });

    test('shows matches, errors, ambiguities and blocked deletes as plain text and blocks confirm', async () => {
        (previewRoutineImport as Mock).mockResolvedValue({
            ...okPreview,
            ok: false,
            mode: 'update',
            rows: [
                { row: 2, status: 'ok', exercise: { how: 'name', id: 11, name: '<b>Bench</b>' } },
                {
                    row: 3, status: 'error', exercise: {
                        how: 'ambiguous',
                        candidates: [{ id: 4, name: 'Curl' }, { id: 5, name: 'Curl' }]
                    }
                },
            ],
            errors: [
                { row: 3, column: 'exercise_name', message: 'Several exercises have this name; set exercise_id.' },
                { row: 4, column: 'notes', message: '<img src=x onerror="alert(1)">' },
                { row: null, column: null, message: 'The file has no rows.' },
            ],
            diff: {
                ...okPreview.diff,
                blocked_deletes: [{ kind: 'day', id: 9, reason: 'Deleting it would delete logged history (workout sessions).' }],
            },
        } satisfies ImportPreview);
        renderDialog();
        await chooseUpdateTarget();
        pick(fileA);
        await user.click(previewButton());

        const preview = await screen.findByTestId('import-preview');
        expect(previewRoutineImport).toHaveBeenCalledWith({ file: fileA, mode: 'update', routineId: 1, dropUnsupported: false });
        expect(within(preview).getByText('<b>Bench</b> (#11, matched by name)')).toBeInTheDocument();
        expect(within(preview).getByText('Ambiguous: Curl (#4), Curl (#5)')).toBeInTheDocument();
        expect(within(preview).getByText('exercise_name: Several exercises have this name; set exercise_id.')).toBeInTheDocument();
        // A row only named by an error is still listed
        expect(within(preview).getByText('notes: <img src=x onerror="alert(1)">')).toBeInTheDocument();
        expect(within(preview).getByText('The file has no rows.')).toBeInTheDocument();
        expect(within(preview).getByText('day #9: Deleting it would delete logged history (workout sessions).')).toBeInTheDocument();
        expect(preview.querySelector('img, b')).toBeNull();
        expect(confirmButton()).toBeDisabled();
    });

    test('drop unsupported is offered when create rejects unsupported rows, and toggling it needs a new preview', async () => {
        (previewRoutineImport as Mock)
            .mockResolvedValueOnce({
                ...okPreview,
                ok: false,
                errors: [{ row: 2, column: 'unsupported', message: 'This row has settings the file cannot carry (progression).' }],
            })
            .mockResolvedValueOnce({ ...okPreview, unsupported_dropped: [{ row: 2, codes: ['progression'] }] });
        renderDialog();
        pick(fileA);
        await user.click(previewButton());

        await user.click(await screen.findByRole('checkbox', { name: 'routines.spreadsheet.dropUnsupported' }));
        expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();
        await user.click(previewButton());

        expect(previewRoutineImport).toHaveBeenLastCalledWith({ file: fileA, mode: 'create', routineId: null, dropUnsupported: true });
        expect(await screen.findByText('routines.spreadsheet.unsupportedDropped')).toBeInTheDocument();
        expect(confirmButton()).toBeEnabled();
    });

    test.each([
        [409, { ...okPreview, detail: 'The file or routine changed since the preview, preview again.' }, 'The file or routine changed since the preview, preview again.'],
        [400, { ...okPreview, ok: false, errors: [{ row: 2, column: 'sets', message: 'Too many.' }] }, 'routines.spreadsheet.confirmFailed'],
    ])('a %i confirm reports nothing written and needs a new preview', async (status, body, message) => {
        (previewRoutineImport as Mock).mockResolvedValue(okPreview);
        (confirmRoutineImport as Mock).mockRejectedValue(httpError(status, body));
        renderDialog();
        pick(fileA);
        await user.click(previewButton());
        await waitFor(() => expect(confirmButton()).toBeEnabled());

        await user.click(confirmButton());

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByText('routines.spreadsheet.importDone')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'routines.spreadsheet.openRoutine' })).not.toBeInTheDocument();
        expect(screen.getByText('routines.spreadsheet.previewBlocked')).toBeInTheDocument();
        expect(confirmButton()).toBeDisabled();
    });

    test('updating a routine the user does not own says so', async () => {
        (previewRoutineImport as Mock).mockRejectedValue(httpError(404, { detail: 'Not found.' }));
        renderDialog();
        await chooseUpdateTarget();
        pick(fileA);
        await user.click(previewButton());

        expect(await screen.findByText('routines.spreadsheet.notOwned')).toBeInTheDocument();
        expect(confirmButton()).toBeDisabled();
    });
});
