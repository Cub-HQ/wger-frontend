import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useIsMutating } from '@tanstack/react-query';
import {
    getRoutineRevision,
    recoveryFailure,
    RoutineRecovery,
    TrashReceipt
} from '@/components/Routines/api/routineRecovery';
import { useRestoreRoutineQuery, useRoutineRecoveriesQuery } from '@/components/Routines/queries/routineRecovery';
import { dateTimeToLocale } from '@/core/lib/date';
import { makeLink, WgerLink } from '@/core/lib/url';
import { randomUUID } from '@/core/lib/uuid';

// Shown after a trash, so the owner can undo without looking for the routine
export type JustTrashed = TrashReceipt & { name: string };

const nameOf = (recovery: RoutineRecovery) => recovery.routine_name || `Routine #${recovery.routine_id}`;

const describe = (recovery: RoutineRecovery) => {
    const when = dateTimeToLocale(new Date(recovery.created_at));
    switch (recovery.operation) {
        case 'trash':
            return `${nameOf(recovery)} — moved to Trash ${when}`;
        case 'restore':
            return `${nameOf(recovery)} — restored ${when}`;
        default:
            return `${nameOf(recovery)} — version before the ${recovery.operation} on ${when}`;
    }
};

const failureMessage = (error: unknown) => {
    const failure = recoveryFailure(error);
    switch (failure.kind) {
        case 'conflict':
            // stale_revision: changed while the dialog was open. restore_conflict: a later change must be undone first
            return failure.code === 'stale_revision'
                ? 'The routine changed while this was open. Nothing was restored. Try again.'
                : `${failure.detail ?? 'This conflicts with the current routine.'} Nothing was restored.`;
        case 'expired':
            return 'This can no longer be restored: its 14 days have passed. Your logged workouts are not affected.';
        case 'notFound':
            return 'This is not available to restore. You can only restore your own routines.';
        case 'invalid':
            return failure.detail ?? 'The server refused this restore. Nothing was changed.';
        case 'retry':
            return 'Could not reach the server. Try again; retrying never restores twice.';
    }
};

type Target = { recoveryId: string, routineId: number, operation: string, name: string };
type Pending = Target & { revision: string, key: string };

/*
 * The owner's Trash and previous plan versions, restorable for 14 days.
 * Restoring never changes completed workouts.
 */
export const RoutineTrash = ({ justTrashed, routineId }: { justTrashed?: JustTrashed, routineId?: number }) => {
    const { i18n } = useTranslation();
    const recoveries = useRoutineRecoveriesQuery(routineId);
    const restoration = useRestoreRoutineQuery();
    const [confirm, setConfirm] = useState<Pending | null>(null);
    const [preparing, setPreparing] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [undone, setUndone] = useState(false);
    // Lock synchronously as well as disabling controls: double clicks can precede a render
    const inFlight = useRef(false);
    const busy = preparing !== null || restoration.isPending;
    const section = useRef<HTMLElement>(null);

    // Each saved planning edit records a new previous version: show it once the edit settles
    const mutating = useIsMutating() > 0;
    const wasMutating = useRef(false);
    const refetch = recoveries.refetch;
    useEffect(() => {
        if (wasMutating.current && !mutating) void refetch();
        wasMutating.current = mutating;
    }, [mutating, refetch]);

    // "#trash" links: the page may render inside a shadow root, where the browser can't find the anchor
    useEffect(() => {
        const reveal = () => { if (window.location.hash === '#trash') section.current?.scrollIntoView(); };
        reveal();
        window.addEventListener('hashchange', reveal);
        return () => window.removeEventListener('hashchange', reveal);
    }, []);

    // Callers hold the inFlight lock
    const send = async (pending: Pending) => {
        setError('');
        setMessage('');
        try {
            await restoration.mutateAsync({ recoveryId: pending.recoveryId, revision: pending.revision, key: pending.key });
            setConfirm(null);
            setMessage(pending.operation === 'trash'
                ? `${pending.name} is back in your routines.`
                : `${pending.name} was restored to the earlier version.`);
            if (pending.recoveryId === justTrashed?.recovery_id) setUndone(true);
        } catch (e) {
            setError(failureMessage(e));
            if (recoveryFailure(e).kind === 'retry') {
                // Same revision and key on retry, the server returns the original receipt if it was applied
                setConfirm(pending);
            } else {
                setConfirm(null);
                void recoveries.refetch();
            }
        }
    };

    const restore = async (pending: Pending) => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            await send(pending);
        } finally {
            inFlight.current = false;
        }
    };

    // The revision is fetched fresh for every action, so a stale view can't overwrite later edits.
    // Locked from the first click, so clicks during the revision GET can't start a second action.
    const prepare = async (target: Target, direct: boolean) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setError('');
        setMessage('');
        setPreparing(target.recoveryId);
        try {
            const pending = { ...target, revision: await getRoutineRevision(target.routineId), key: randomUUID() };
            setPreparing(null);
            if (direct) {
                await send(pending);
            } else {
                setConfirm(pending);
            }
        } catch (e) {
            setError(failureMessage(e));
        } finally {
            setPreparing(null);
            inFlight.current = false;
        }
    };

    // A 'restore' entry has no redo, it would only be noise here
    const listed = (recoveries.data ?? []).filter(recovery => recovery.operation !== 'restore');
    return <Box component="section" ref={section} id="trash" aria-labelledby="routine-trash-title" aria-busy={recoveries.isFetching || busy} sx={{ mt: 3 }}>
        {justTrashed && !undone && <Alert severity="success" role="status" sx={{ mb: 2 }} action={
            <Button color="inherit" size="small" disabled={busy} onClick={() => {
                void prepare({ recoveryId: justTrashed.recovery_id, routineId: justTrashed.routine_id, operation: 'trash', name: justTrashed.name }, true);
            }}>{preparing === justTrashed.recovery_id || (restoration.isPending && confirm === null) ? 'Undoing…' : 'Undo'}</Button>
        }>
            {justTrashed.name} moved to Trash. You can restore it until {dateTimeToLocale(new Date(justTrashed.expires_at))}.
        </Alert>}
        {message && <Alert severity="success" role="status" sx={{ mb: 2 }}>{message}</Alert>}
        {error && confirm === null && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography id="routine-trash-title" variant="h6" component="h2">{routineId === undefined ? 'Trash and previous versions' : 'Previous versions'}</Typography>
        <Typography variant="body2">
            Trashed routines and the version before each edit or rebuild can be restored for 14 days.
            Logged workouts always stay in your history.
        </Typography>
        {recoveries.isPending && <Typography role="status">Loading…</Typography>}
        {recoveries.isError && <Alert severity="error">Could not load the Trash. <Button onClick={() => { void recoveries.refetch(); }}>Retry</Button></Alert>}
        {recoveries.isSuccess && listed.length === 0 && <Typography>Nothing to restore.</Typography>}
        {listed.map(recovery => <Stack key={recovery.recovery_id} component="article" aria-label={describe(recovery)} spacing={0.5} sx={{ my: 2 }}>
            <Typography>{describe(recovery)}</Typography>
            <Typography variant="body2" color="text.secondary">
                {recovery.restorable
                    ? `Restorable until ${dateTimeToLocale(new Date(recovery.expires_at))}`
                    : recovery.restored_at ? `Restored ${dateTimeToLocale(new Date(recovery.restored_at))}` : 'Not restorable'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {recovery.restorable && <Button disabled={busy} onClick={() => { void prepare({
                    recoveryId: recovery.recovery_id,
                    // Restore checks the routine that is current now: after a rebuild, that's the replacement
                    routineId: recovery.replacement_routine_id ?? recovery.routine_id,
                    operation: recovery.operation,
                    name: nameOf(recovery),
                }, false); }}>
                    {preparing === recovery.recovery_id ? 'Checking…' : 'Restore'}
                </Button>}
                {recovery.operation === 'trash' && <Button href={makeLink(WgerLink.ROUTINE_LOGS_OVERVIEW, i18n.language, { id: recovery.routine_id })}>
                    Logged workouts
                </Button>}
            </Stack>
        </Stack>)}

        <Dialog open={confirm !== null} onClose={() => { if (!inFlight.current) { setConfirm(null); setError(''); } }} aria-labelledby="restore-routine-title">
            <DialogTitle id="restore-routine-title">
                {confirm?.operation === 'trash' ? 'Restore routine?' : 'Restore earlier version?'}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {confirm && (confirm.operation === 'trash'
                        ? `${confirm.name} returns to your active routines and calendar.`
                        : `${confirm.name} goes back to this earlier plan and replaces the current one.`)}
                    {' '}Logged workouts are not changed.
                </DialogContentText>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button disabled={restoration.isPending} onClick={() => { setConfirm(null); setError(''); }}>Cancel</Button>
                <Button variant="contained" disabled={restoration.isPending} onClick={() => { if (confirm) void restore(confirm); }}>
                    {restoration.isPending ? 'Restoring…' : error ? 'Try again' : 'Restore'}
                </Button>
            </DialogActions>
        </Dialog>
    </Box>;
};
