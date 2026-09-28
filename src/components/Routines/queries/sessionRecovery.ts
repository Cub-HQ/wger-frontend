import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteSession, getSessionRecoveries, restoreSession } from '@/components/Routines/api/sessionRecovery';
import { QueryKey } from '@/core/lib/consts';

export const SESSION_RECOVERIES = 'session-recoveries';

const invalidateRecoveryReads = async (client: ReturnType<typeof useQueryClient>, routineId: number) => {
    await Promise.all([
        [QueryKey.SESSIONS_FULL],
        [QueryKey.SESSION_SEARCH],
        [QueryKey.ROUTINE_LOG_DATA, routineId],
        [QueryKey.ROUTINE_DETAIL, routineId],
        [QueryKey.ROUTINE_OVERVIEW],
        [SESSION_RECOVERIES, routineId],
    ].map(queryKey => client.invalidateQueries({ queryKey })));
};

export const useSessionRecoveriesQuery = (routineId: number) => useQuery({
    queryKey: [SESSION_RECOVERIES, routineId],
    queryFn: () => getSessionRecoveries(routineId),
    // Availability is server-owned, including expiry while this page stays open.
    refetchInterval: 30_000,
});

export const useDeleteSessionQuery = (routineId: number) => {
    const client = useQueryClient();
    return useMutation({
        mutationFn: deleteSession,
        retry: false,
        onSuccess: () => invalidateRecoveryReads(client, routineId),
    });
};

export const useRestoreSessionQuery = (routineId: number) => {
    const client = useQueryClient();
    return useMutation({
        mutationFn: restoreSession,
        retry: false,
        onSuccess: () => invalidateRecoveryReads(client, routineId),
    });
};
