import axios from 'axios';
import { ApiPath } from '@/core/lib/consts';
import { makeHeader, makeUrl } from '@/core/lib/url';

/*
 * Routine trash / previous-version recovery, contract v1 of Cub-HQ/wger-gym#24.
 * Everything is kept for 14 x 24h; logged workouts are never touched.
 */

export type RecoveryOperation = 'trash' | 'edit' | 'rebuild' | 'restore';

export interface RoutineRecovery {
    recovery_id: string;
    routine_id: number;
    routine_name: string;
    operation: RecoveryOperation;
    created_at: string;
    expires_at: string;
    // False once restored, and always for 'restore' rows (there is no redo)
    restorable: boolean;
    restored_at: string | null;
    // For a rebuild: the routine that replaced this one
    replacement_routine_id: number | null;
}

export interface TrashReceipt {
    routine_id: number;
    recovery_id: string;
    operation: 'trash';
    deleted_at: string;
    expires_at: string;
    revision: string;
}

export interface RestoreReceipt {
    routine_id: number;
    revision: string;
    restored_from: string;
    recovery_id: string;
    expires_at: string;
}

interface Paginated<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

// Opaque token of the complete plan, for stale-write protection. Also works on trashed routines
export const getRoutineRevision = async (routineId: number): Promise<string> => {
    const response = await axios.get<{ routine_id: number, revision: string, deleted_at: string | null, replaced_by: number | null }>(
        makeUrl(ApiPath.ROUTINE, { id: routineId, objectMethod: 'revision' }),
        { headers: makeHeader() }
    );
    return response.data.revision;
};

export const trashRoutine = async (
    routineId: number,
    expectedRevision: string,
    idempotencyKey: string
): Promise<TrashReceipt> => {
    const response = await axios.post<TrashReceipt>(
        makeUrl(ApiPath.ROUTINE, { id: routineId, objectMethod: 'trash' }),
        { expected_revision: expectedRevision, idempotency_key: idempotencyKey },
        { headers: makeHeader() }
    );
    return response.data;
};

// Only unexpired entries, newest first. Optionally those of one routine
export const getRoutineRecoveries = async (routineId?: number): Promise<RoutineRecovery[]> => {
    let url: string | null = makeUrl(ApiPath.ROUTINE, { objectMethod: 'recoveries', query: routineId === undefined ? undefined : { routine: routineId } });
    const results: RoutineRecovery[] = [];
    while (url) {
        const response: { data: Paginated<RoutineRecovery> } = await axios.get<Paginated<RoutineRecovery>>(url, { headers: makeHeader() });
        results.push(...response.data.results);
        url = response.data.next;
    }
    return results;
};

export const restoreRoutineRecovery = async (
    recoveryId: string,
    expectedRevision: string,
    idempotencyKey: string
): Promise<RestoreReceipt> => {
    const response = await axios.post<RestoreReceipt>(
        makeUrl(ApiPath.ROUTINE, { objectMethod: `recoveries/${encodeURIComponent(recoveryId)}/restore` }),
        { expected_revision: expectedRevision, idempotency_key: idempotencyKey },
        { headers: makeHeader() }
    );
    return response.data;
};

/*
 * What a failed recovery write means for the user. Only 'retry' keeps the
 * idempotency key: the request may have been applied, so resending it must
 * return the original receipt. Every other kind was refused, nothing written.
 */
export type RecoveryFailure = 'conflict' | 'expired' | 'notFound' | 'invalid' | 'retry';

export interface RecoveryError {
    kind: RecoveryFailure;
    // Server code of a 409: stale_revision, routine_trashed, restore_conflict, …
    code?: string;
    detail?: string;
}

export const recoveryFailure = (error: unknown): RecoveryError => {
    if (!axios.isAxiosError(error) || !error.response) {
        return { kind: 'retry' };
    }
    const data = error.response.data;
    const detail = data && typeof data === 'object' && typeof data.detail === 'string' ? data.detail : undefined;
    switch (error.response.status) {
        case 409:
            return { kind: 'conflict', code: data && typeof data.code === 'string' ? data.code : undefined, detail };
        case 410:
            return { kind: 'expired', detail };
        case 401:
        case 403:
        case 404:
            return { kind: 'notFound', detail };
        case 400:
            return { kind: 'invalid', detail };
        default:
            return { kind: 'retry', detail };
    }
};
