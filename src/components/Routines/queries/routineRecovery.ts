import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoutineRecoveries, restoreRoutineRecovery, trashRoutine } from '@/components/Routines/api/routineRecovery';
import { QueryKey } from '@/core/lib/consts';

export const ROUTINE_RECOVERIES = 'routine-recoveries';

// Trash/restore changes which plans are active and which future occurrences the
// calendar shows. Completed history itself is never touched.
const invalidatePlanReads = (client: QueryClient) => Promise.all([
    [QueryKey.ROUTINE_OVERVIEW],
    [QueryKey.ROUTINES_SHALLOW],
    [QueryKey.ROUTINES_ACTIVE],
    [QueryKey.ROUTINE_DETAIL],
    [QueryKey.PRIVATE_TEMPLATES],
    [QueryKey.SESSIONS_FULL],
    [QueryKey.SESSION_SEARCH],
    [ROUTINE_RECOVERIES],
].map(queryKey => client.invalidateQueries({ queryKey })));

export const useRoutineRecoveriesQuery = (routineId?: number) => useQuery({
    queryKey: [ROUTINE_RECOVERIES, routineId],
    queryFn: () => getRoutineRecoveries(routineId),
    // Restorability and expiry are server-owned, also while the page stays open
    refetchInterval: 30_000,
});

export const useTrashRoutineQuery = (routineId: number) => {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ revision, key }: { revision: string, key: string }) => trashRoutine(routineId, revision, key),
        retry: false,
        onSuccess: () => invalidatePlanReads(client),
    });
};

export const useRestoreRoutineQuery = () => {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ recoveryId, revision, key }: { recoveryId: string, revision: string, key: string }) =>
            restoreRoutineRecovery(recoveryId, revision, key),
        retry: false,
        onSuccess: () => invalidatePlanReads(client),
    });
};
