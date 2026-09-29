import {
    addRoutine,
    confirmRoutineImport,
    deleteRoutine,
    editRoutine,
    getActiveRoutine,
    getPrivateTemplatesShallow,
    getPublicTemplatesShallow,
    getRoutine,
    getRoutineLogData,
    getRoutines,
    getRoutinesShallow,
    getRoutineStatisticsData,
    ImportRequest
} from "@/components/Routines/api/routine";
import { Routine } from "@/components/Routines/models/Routine";
import { QueryKey, } from "@/core/lib/consts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";


export function useRoutinesQuery() {
    return useQuery({
        queryKey: [QueryKey.ROUTINE_OVERVIEW],
        queryFn: getRoutines
    });
}

export function useRoutineDetailQuery(id: number, enabled = true) {
    return useQuery({
        queryKey: [QueryKey.ROUTINE_DETAIL, id],
        queryFn: () => getRoutine(id),
        enabled,
    });
}

export function useRoutineStatsQuery(id: number) {
    return useQuery({
        queryKey: [QueryKey.ROUTINE_STATS, id],
        queryFn: () => getRoutineStatisticsData(id)
    });
}

export function useRoutineLogData(id: number) {
    return useQuery({
        queryKey: [QueryKey.ROUTINE_LOG_DATA, id],
        queryFn: () => getRoutineLogData(id)
    });
}

/*
 * Retrieves all routines
 *
 * Note: strictly only the routine data, no days or any other sub-objects
 */
export function useRoutinesShallowQuery() {
    return useQuery({
        queryKey: [QueryKey.ROUTINES_SHALLOW],
        queryFn: getRoutinesShallow
    });
}

export function usePrivateRoutinesShallowQuery() {
    return useQuery({
        queryKey: [QueryKey.PRIVATE_TEMPLATES],
        queryFn: getPrivateTemplatesShallow
    });
}

export function usePublicRoutinesShallowQuery() {
    return useQuery({
        queryKey: [QueryKey.PUBLIC_TEMPLATES],
        queryFn: getPublicTemplatesShallow
    });
}

/*
 * Retrieves all routines
 *
 * Note: strictly only the routine data, no days or any other sub-objects
 */
export function useActiveRoutineQuery() {
    return useQuery({
        queryKey: [QueryKey.ROUTINES_ACTIVE],
        queryFn: getActiveRoutine
    });
}


export const useAddRoutineQuery = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (routine: Routine) => addRoutine(routine),
        onSuccess: () => queryClient.invalidateQueries(
            { queryKey: [QueryKey.ROUTINE_OVERVIEW] }
        ),
    });
};


export const useEditRoutineQuery = (routineId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (routine: Routine) => editRoutine(routine),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_OVERVIEW] });
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, routineId] });
        }
    });
};

export const useDeleteRoutineQuery = (id: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => deleteRoutine(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_OVERVIEW] });
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, id] });
        }
    });
};

export const useConfirmRoutineImportQuery = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ request, planHash }: { request: ImportRequest, planHash: string }) =>
            confirmRoutineImport(request, planHash),
        onSuccess: (data) => Promise.all([
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_OVERVIEW] }),
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINES_SHALLOW] }),
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINES_ACTIVE] }),
            queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, data.id] }),
        ]),
    });
};

