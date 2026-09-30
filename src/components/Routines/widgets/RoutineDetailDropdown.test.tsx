import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from '@testing-library/react';
import userEvent from "@testing-library/user-event";
import { downloadRoutineSpreadsheet } from "@/components/Routines/api/routine";
import { RoutineDetailDropdown } from "@/components/Routines/widgets/RoutineDetailDropdown";
import React from 'react';
import { MemoryRouter } from "react-router-dom";
import { testQueryClient } from "@/tests/queryClient";
import { testPrivateTemplate1, testRoutine1 } from "@/tests/workoutRoutinesTestData";
import type { Mock } from 'vitest';
import { Routine } from "@/components/Routines/models/Routine";

vi.mock("@/components/Routines/queries");
vi.mock("@/components/Routines/api/routine");

describe("Test the RoutineDetailDropdown component", () => {

    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
        user = userEvent.setup();
        vi.resetAllMocks();
    });

    const renderAndOpenMenu = async (routine: Routine) => {
        render(
            <QueryClientProvider client={testQueryClient}>
                <MemoryRouter>
                    <RoutineDetailDropdown routine={routine} />
                </MemoryRouter>
            </QueryClientProvider>
        );
        await user.click(screen.getByRole('button'));
    };

    test('shows the log and stats entries for a regular routine', async () => {

        // Act
        await renderAndOpenMenu(testRoutine1);

        // Assert
        expect(screen.getByText('routines.logsOverview')).toBeInTheDocument();
        expect(screen.getByText('routines.statsOverview')).toBeInTheDocument();
    });

    test('hides the log and stats entries for a template', async () => {

        // Act
        await renderAndOpenMenu(testPrivateTemplate1);

        // Assert
        // Logs and stats only make sense for a routine the user actually trains
        expect(screen.queryByText('routines.logsOverview')).not.toBeInTheDocument();
        expect(screen.queryByText('routines.statsOverview')).not.toBeInTheDocument();
        expect(screen.getByText('edit')).toBeInTheDocument();
    });

    test('mark as template opens the template form', async () => {

        // Act
        await renderAndOpenMenu(testRoutine1);
        await user.click(screen.getByText('routines.markAsTemplate'));

        // Assert
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('routines.markAsTemplate')).toBeInTheDocument();
    });

    test('spreadsheet downloads go through the authenticated API and report failures', async () => {
        (downloadRoutineSpreadsheet as Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('403'));
        await renderAndOpenMenu(testRoutine1);

        await user.click(screen.getByText('routines.spreadsheet.downloadXlsx'));
        expect(downloadRoutineSpreadsheet).toHaveBeenCalledWith('xlsx', 1);
        expect(screen.queryByText('routines.spreadsheet.downloadFailed')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button'));
        await user.click(screen.getByText('routines.spreadsheet.downloadCsv'));
        expect(downloadRoutineSpreadsheet).toHaveBeenLastCalledWith('csv', 1);
        expect(await screen.findByText('routines.spreadsheet.downloadFailed')).toBeInTheDocument();
    });
});
