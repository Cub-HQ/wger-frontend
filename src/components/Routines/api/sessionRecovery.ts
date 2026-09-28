import axios from 'axios';
import { ApiPath } from '@/core/lib/consts';
import { makeHeader, makeUrl } from '@/core/lib/url';

export interface SessionRecovery {
    id: string;
    original_session_id: string;
    routine_id: number | null;
    deleted_at: string;
    expires_at: string;
    datetime_start: string;
}

export const deleteSession = async (id: string): Promise<SessionRecovery> => {
    const response = await axios.delete<SessionRecovery>(makeUrl(ApiPath.SESSION, { id }), { headers: makeHeader() });
    return response.data;
};

export const getSessionRecoveries = async (routineId: number): Promise<SessionRecovery[]> => {
    const response = await axios.get<SessionRecovery[]>(
        makeUrl(ApiPath.SESSION, { objectMethod: 'recoveries', query: { routine: routineId } }),
        { headers: makeHeader() }
    );
    return response.data;
};

export const restoreSession = async (id: string): Promise<void> => {
    await axios.post(
        makeUrl(ApiPath.SESSION, { objectMethod: `recoveries/${encodeURIComponent(id)}/restore` }),
        undefined,
        { headers: makeHeader() }
    );
};
