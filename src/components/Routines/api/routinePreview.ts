import axios from 'axios';
import { RoutineDayData } from '@/components/Routines/models/RoutineDayData';
import { makeHeader, makeUrl } from '@/core/lib/url';

export const ROUTINE_PREVIEW_PATH = 'routine-preview';

export interface RoutinePreview {
    previewId: string;
    planHash: string;
    externalVersion: string | null;
    expiresAt: Date;
    name: string;
    description: string;
    /** Display names keyed by exercise id; the sequence only carries ids */
    exerciseNames: Record<string, string>;
    /** Items of the resolved date sequence, same shape as routine/{id}/date-sequence-display/ */
    schedule: RoutineDayData[];
}

interface RoutinePreviewResponse {
    preview_id: string;
    plan_hash: string;
    external_version: string | null;
    expires_at: string;
    canonical_proposal: { routine: { name: string, description: string } };
    exercise_names: Record<string, string>;
    schedule: unknown[];
}

/*
 * Owner-only read of an unapproved program proposal (Cub-HQ/wger-gym#26).
 * Nothing here writes: the preview is not a routine, so there is no routine
 * id to link to or act on.
 */
export const getRoutinePreview = async (previewId: string): Promise<RoutinePreview> => {
    const { data } = await axios.get<RoutinePreviewResponse>(
        makeUrl(ROUTINE_PREVIEW_PATH, { id: encodeURIComponent(previewId) }),
        { headers: makeHeader() }
    );

    return {
        previewId: data.preview_id,
        planHash: data.plan_hash,
        externalVersion: data.external_version,
        expiresAt: new Date(data.expires_at),
        name: data.canonical_proposal.routine.name,
        description: data.canonical_proposal.routine.description,
        exerciseNames: data.exercise_names,
        schedule: data.schedule.map(item => RoutineDayData.fromJson(item)),
    };
};
