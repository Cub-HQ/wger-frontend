import { useBodyWeightCategoryQuery, useDisplayWeightUnit } from "@/components/Measurements";
import { dateTimeToLocale, dateToLocale } from "@/core/lib/date";
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import {
    Alert,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Typography
} from '@mui/material';
import React from 'react';
import { useTranslation } from "react-i18next";
import type { DayProps } from "./CalendarComponent";
import { SetSummary } from "@/components/Routines/widgets/WaveOne";
import { useDeleteSessionQuery, useSessionsQuery, WorkoutSession } from "@/components/Routines";
import EditIcon from "@mui/icons-material/Edit";
import { Button, Stack } from "@mui/material";
import { makeLink, WgerLink } from "@/core/lib/url";

interface LogProps {
    selectedDay: DayProps;
    isStandalone?: boolean;
}

const Entries: React.FC<LogProps> = ({ selectedDay, isStandalone }) => {
    // <html lang> is empty on the gym, i18next is what knows the page language
    const [t, i18n] = useTranslation();
    const allSessions = useSessionsQuery();
    const displayWeightUnit = useDisplayWeightUnit();
    // Entries without their own unit fall back to the one of the category
    const categoryUnit = useBodyWeightCategoryQuery().data?.unit ?? 'kg';

    const [openMeasurements, setOpenMeasurements] = React.useState(false);
    // A day can hold several sessions, at most one of them is expanded
    const [openSessionId, setOpenSessionId] = React.useState<string | null>(null);
    const [openNutritionDiary, setOpenNutritionDiary] = React.useState(false);

    // Same confirm-then-delete flow as the routine logs; the server keeps the
    // session restorable for 15 days
    const [deleting, setDeleting] = React.useState<WorkoutSession | null>(null);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const deletion = useDeleteSessionQuery(deleting?.routineId ?? 0);
    // Lock synchronously as well as disabling controls: double clicks can precede a render
    const inFlight = React.useRef(false);
    const sessionLabel = (session: WorkoutSession) => `${session.dayObj?.name || 'Workout'} — ${dateTimeToLocale(session.datetimeStart)}`;
    const closeDelete = () => {
        if (!inFlight.current) {
            setDeleting(null);
            setError('');
        }
    };
    const confirmDelete = async () => {
        if (!deleting?.id || inFlight.current) return;
        inFlight.current = true;
        setError('');
        setMessage('');
        try {
            // Resolves after the calendar's sessions were refetched
            await deletion.mutateAsync(deleting.id);
            setDeleting(null);
            setMessage('Workout deleted. You can restore it from Deleted workouts on the routine logs for 15 days.');
        } catch {
            setError('Could not delete this workout. Your workout has not been hidden. Please try again.');
        } finally {
            inFlight.current = false;
        }
    };

    isStandalone = isStandalone ?? true;

    return (
        <Card
            sx={{
                boxShadow: isStandalone ? undefined : 'none',
                width: { xs: 'auto', md: '45%' },
                height: { xs: '60%', md: '100%' },
                display: 'flex',
                flexDirection: 'column',
                // m: { xs: 0, sm: 1, md: 2 },
                // p: { xs: 1, sm: 1.5, md: 2 }

            }}
        >
            <CardHeader
                title={
                    <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
                        {t("entries")} - {dateToLocale(selectedDay.date)}
                    </Typography>
                }
            />
            <CardContent sx={{
                flex: 1,
                // flex items don't shrink below their content size without this,
                // so the internal scrollbar would never appear
                minHeight: 0,
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}>
                {message && <Alert severity="success" role="status">{message}</Alert>}
                <List>
                    {/* Weight entries */}
                    {selectedDay.weightEntry &&
                        <ListItem>
                            <ListItemText
                                primary={t("weight")}
                                secondary={`${selectedDay.weightEntry.valueIn(displayWeightUnit, categoryUnit).toFixed(1)} ${t(`server.${displayWeightUnit}`)}`}
                                sx={{ pl: 2 }}
                            />
                        </ListItem>}

                    {/* One measurement */}
                    {selectedDay.measurements.length === 1 &&
                        <ListItem>
                            <ListItemText
                                primary={t("measurements.measurements")}
                                secondary={`${selectedDay.measurements[0].name}: ${selectedDay.measurements[0].value} ${selectedDay.measurements[0].unit}`}
                                sx={{ pl: 2 }}
                            />
                        </ListItem>}

                    {/* Measurements */}
                    {selectedDay.measurements.length > 1 && <>
                        <ListItem>
                            <ListItemButton
                                onClick={() => setOpenMeasurements(!openMeasurements)}
                                selected={openMeasurements}
                            >
                                <ListItemText primary={t("measurements.measurements")} />
                                {openMeasurements ? <ExpandLess /> : <ExpandMore />}
                            </ListItemButton>
                        </ListItem>
                        <Collapse in={openMeasurements} timeout="auto" unmountOnExit>
                            <List sx={{ pl: 4, pt: 0 }}>
                                {selectedDay.measurements.map((measurement) => (
                                    <ListItem
                                        key={`${measurement.date.toISOString()}-${measurement.name}-${measurement.unit}`}
                                        dense>
                                        <ListItemText
                                            primary={measurement.name}
                                            secondary={`${measurement.value} ${measurement.unit}`}
                                        />
                                    </ListItem>))}
                            </List>
                        </Collapse>
                    </>}

                    {/* Workout sessions */}
                    {selectedDay.workoutSessions.map((session) => <React.Fragment key={session.id}>
                        <ListItem>
                            <ListItemButton
                                onClick={() => setOpenSessionId(openSessionId === session.id ? null : session.id)}
                                selected={openSessionId === session.id}
                            >
                                <ListItemText
                                    primary={t("routines.workoutSession")}
                                    secondary={session.textRepresentation}
                                    sx={{
                                        '& .MuiListItemText-secondary': {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }
                                    }}
                                />
                                {openSessionId === session.id ? <ExpandLess /> : <ExpandMore />}
                            </ListItemButton>
                        </ListItem>
                        <Collapse in={openSessionId === session.id} timeout="auto" unmountOnExit>
                            <List sx={{ pl: 4, pt: 0 }}>
                                {session.logs.map((log) => (
                                    <ListItem key={log.id} dense>
                                        <ListItemText primary={log.exerciseObj?.getTranslation().name} secondary={<SetSummary log={log} sessions={allSessions.data ?? []} />} />
                                    </ListItem>))}
                                <ListItem>
                                    <Stack direction="row" spacing={1}>
                                        <Button href={makeLink(WgerLink.SESSION_DETAIL, i18n.language, { id: session.id! })}>View workout</Button>
                                        <Button href={makeLink(WgerLink.SESSION_EDIT, i18n.language, { id: session.id! })} startIcon={<EditIcon />}>Edit sets</Button>
                                        {/* Only a saved session can go through the session API */}
                                        {session.id && <Button color="error" disabled={deletion.isPending} onClick={() => { setError(''); setMessage(''); setDeleting(session); }}>Delete workout</Button>}
                                    </Stack>
                                </ListItem>
                            </List>
                        </Collapse>
                    </React.Fragment>)}

                    {/* Nutrition diary */}
                    {selectedDay.nutritionLogs.length > 0 && <>
                        <ListItem>
                            <ListItemButton
                                onClick={() => setOpenNutritionDiary(!openNutritionDiary)}
                                selected={openNutritionDiary}
                            >
                                <ListItemText primary={t("nutrition.nutritionalDiary")} />
                                {openNutritionDiary ? <ExpandLess /> : <ExpandMore />}
                            </ListItemButton>
                        </ListItem>
                        <Collapse in={openNutritionDiary} timeout="auto" unmountOnExit>
                            <List sx={{ pl: 4, pt: 0 }}>
                                {selectedDay.nutritionLogs.map((log) => (
                                    <ListItem key={log.id} dense>
                                        <ListItemText
                                            primary={log.ingredient?.name}
                                            secondary={`${log.amount} ${t('nutrition.gramShort')}`}
                                        />
                                    </ListItem>))}
                            </List>
                        </Collapse>
                    </>}
                </List>

            </CardContent>
            <Dialog open={deleting !== null} onClose={closeDelete} aria-labelledby="calendar-delete-workout-title" aria-describedby="calendar-delete-workout-description">
                <DialogTitle id="calendar-delete-workout-title">Delete workout?</DialogTitle>
                <DialogContent>
                    <DialogContentText id="calendar-delete-workout-description">{deleting && sessionLabel(deleting)}. This removes the workout and all its sets. You can restore them from Deleted workouts on the routine logs for 15 days.</DialogContentText>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button disabled={deletion.isPending} onClick={closeDelete}>Cancel</Button>
                    <Button color="error" disabled={deletion.isPending} onClick={() => { void confirmDelete(); }}>{deletion.isPending ? 'Deleting…' : 'Delete workout'}</Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default Entries;
