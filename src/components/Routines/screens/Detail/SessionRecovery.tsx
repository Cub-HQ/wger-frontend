import React, { useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WorkoutSession } from '@/components/Routines/models/WorkoutSession';
import { useDeleteSessionQuery, useRestoreSessionQuery, useSessionRecoveriesQuery } from '@/components/Routines/queries/sessionRecovery';
import { makeLink, WgerLink } from '@/core/lib/url';

export const SessionRecoveryControls = ({ routineId, sessions }: { routineId: number; sessions: WorkoutSession[] }) => {
    const { i18n } = useTranslation();
    const recoveries = useSessionRecoveriesQuery(routineId);
    const deletion = useDeleteSessionQuery(routineId);
    const restoration = useRestoreSessionQuery(routineId);
    const [selected, setSelected] = useState<WorkoutSession | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    // Lock synchronously as well as disabling controls: double clicks can precede a render.
    const inFlight = useRef(false);
    const pending = deletion.isPending || restoration.isPending;
    const uniqueSessions = Array.from(new Map(sessions.filter(session => session.id).map(session => [session.id, session])).values());
    const label = (session: WorkoutSession) => `${session.dayObj?.name || 'Workout'} — ${session.datetimeStart.toLocaleString()}`;

    const confirmDelete = async () => {
        if (!selected?.id || inFlight.current) return;
        inFlight.current = true;
        setError('');
        setMessage('');
        try {
            await deletion.mutateAsync(selected.id);
            setSelected(null);
            setMessage('Workout deleted. You can restore it from Deleted workouts for 15 days.');
        } catch {
            setError('Could not delete this workout. Your workout has not been hidden. Please try again.');
        } finally {
            inFlight.current = false;
        }
    };

    const restore = async (id: string) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setError('');
        setMessage('');
        try {
            await restoration.mutateAsync(id);
            setMessage('Workout restored, including its sets.');
        } catch {
            setError('Could not restore this workout. It may have expired or conflict with existing data. Refresh and try again.');
        } finally {
            inFlight.current = false;
        }
    };

    return <Stack spacing={2} sx={{ my: 3 }}>
        {message && <Alert severity="success" role="status">{message}</Alert>}
        {error && !selected && <Alert severity="error">{error}</Alert>}
        <Box component="section" aria-labelledby="logged-workouts-title">
            <Typography id="logged-workouts-title" variant="h5" component="h2">Logged workouts</Typography>
            {uniqueSessions.length === 0 && <Typography>No logged workouts.</Typography>}
            {uniqueSessions.map(session => <Stack key={session.id} component="article" aria-label={label(session)} spacing={1} sx={{ my: 2 }}>
                <Typography>{label(session)}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button component={Link} to={makeLink(WgerLink.SESSION_DETAIL, i18n.language, { id: session.id! })}>View workout</Button>
                    <Button component={Link} to={makeLink(WgerLink.SESSION_EDIT, i18n.language, { id: session.id! })}>Edit sets</Button>
                    <Button color="error" disabled={pending} onClick={() => { setError(''); setSelected(session); }}>Delete</Button>
                </Stack>
            </Stack>)}
        </Box>
        <Box component="section" aria-labelledby="deleted-workouts-title" aria-busy={recoveries.isFetching || restoration.isPending}>
            <Typography id="deleted-workouts-title" variant="h5" component="h2">Deleted workouts</Typography>
            <Typography>Deleted workouts can be restored with all their sets for 15 days.</Typography>
            {recoveries.isPending && <Typography role="status">Loading deleted workouts…</Typography>}
            {recoveries.isError && <Alert severity="error">Could not load deleted workouts. <Button onClick={() => { void recoveries.refetch(); }}>Retry</Button></Alert>}
            {recoveries.isSuccess && recoveries.data.length === 0 && <Typography>No deleted workouts available to restore.</Typography>}
            {!recoveries.isError && recoveries.data?.map(recovery => <Stack key={recovery.id} component="article" aria-label={`Deleted workout ${new Date(recovery.datetime_start).toLocaleString()}`} spacing={1} sx={{ my: 2 }}>
                <Typography>Workout — {new Date(recovery.datetime_start).toLocaleString()}</Typography>
                <Typography>Available until {new Date(recovery.expires_at).toLocaleString()}</Typography>
                <Button disabled={pending} onClick={() => { void restore(recovery.id); }}>
                    {restoration.isPending && restoration.variables === recovery.id ? 'Restoring…' : 'Restore workout'}
                </Button>
            </Stack>)}
        </Box>
        <Dialog open={selected !== null} onClose={() => { if (!inFlight.current) { setSelected(null); setError(''); } }} aria-labelledby="delete-workout-title" aria-describedby="delete-workout-description">
            <DialogTitle id="delete-workout-title">Delete workout?</DialogTitle>
            <DialogContent>
                <DialogContentText id="delete-workout-description">{selected && label(selected)}. This removes the workout and all its sets. You can restore them from Deleted workouts for 15 days.</DialogContentText>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button disabled={pending} onClick={() => { setSelected(null); setError(''); }}>Cancel</Button>
                <Button color="error" disabled={pending} onClick={() => { void confirmDelete(); }}>{deletion.isPending ? 'Deleting…' : 'Delete workout'}</Button>
            </DialogActions>
        </Dialog>
    </Stack>;
};
