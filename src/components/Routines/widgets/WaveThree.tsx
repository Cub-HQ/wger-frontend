import { Exercise, NameAutocompleter } from "@/components/Exercises";
import { postExerciseVideo } from "@/components/Exercises/api/video";
import { addSession, editSession } from "@/components/Routines/api/session";
import { addLogs } from "@/components/Routines/api/workoutLogs";
import {
    CardioInput,
    cardioFieldsOf,
    DISTANCE_UNIT_OPTIONS,
    EMPTY_CARDIO_INPUT,
    LIMITS,
    validDecimal,
    validDuration
} from "@/components/Routines/models/cardio";
import { cardioJson } from "@/components/Routines/models/WorkoutLog";
import { TIME_UNKNOWN_LABEL, WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { QueryKey, REP_UNIT_REPETITIONS, WEIGHT_UNIT_KG } from "@/core/lib/consts";
import { makeHeader, makeLink, makeUrl, WgerLink } from "@/core/lib/url";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

const TIMER_KEY = (id: string) => `wger.sessionTimer.${id}`;

const localDateTimeValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const parseLocalDateTime = (value: string) => { const [date, time] = value.split("T"); const [year, month, day] = date.split("-").map(Number); const [hour, minute] = time.split(":").map(Number); return new Date(year, month - 1, day, hour, minute); };

export const SessionTimer = ({ session, onSaved }: { session: WorkoutSession, onSaved: () => Promise<unknown> }) => {
    const stored = localStorage.getItem(TIMER_KEY(session.id!));
    const validStored = stored !== null && session.datetimeEnd === null && !session.timeUnknown && Number(stored) === session.datetimeStart.getTime();
    const [started, setStarted] = useState<number | null>(validStored ? Number(stored) : null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!validStored) localStorage.removeItem(TIMER_KEY(session.id!));
    }, [session.id, validStored]);
    useEffect(() => {
        if (started === null) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [started]);
    const elapsed = started === null ? 0 : Math.max(0, Math.floor((now - started) / 1000));
    const clock = [Math.floor(elapsed / 3600), Math.floor(elapsed % 3600 / 60), elapsed % 60].map(value => value.toString().padStart(2, "0")).join(":");
    const startTimer = () => {
        if (session.datetimeEnd !== null || session.timeUnknown) return;
        const timestamp = session.datetimeStart.getTime();
        localStorage.setItem(TIMER_KEY(session.id!), String(timestamp));
        setStarted(timestamp); setNow(Date.now());
    };
    const finish = async () => {
        const saved = await editSession(WorkoutSession.clone(session, { datetimeEnd: new Date() }));
        localStorage.removeItem(TIMER_KEY(session.id!)); setStarted(null);
        if (saved.datetimeEnd !== null) await onSaved();
    };
    // An imported session with unknown timing is done, never ongoing
    if (session.datetimeEnd !== null || session.timeUnknown) return null;
    return <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
        <Typography variant="h3" sx={{ textAlign: "center" }}>{clock}</Typography>
        <Button fullWidth size="large" variant="contained" color={started === null ? "primary" : "success"} onClick={started === null ? startTimer : finish}>{started === null ? "Start now" : "Finish workout"}</Button>
        <Typography variant="caption">Timer is stored on this phone and survives lock, backgrounding and reload.</Typography>
    </CardContent></Card>;
};

export const SessionMetadataEditor = ({ session, onSaved }: { session: WorkoutSession, onSaved: () => Promise<unknown> }) => {
    const [notes, setNotes] = useState(session.notes ?? "");
    const [start, setStart] = useState(localDateTimeValue(session.datetimeStart));
    const [end, setEnd] = useState(session.datetimeEnd ? localDateTimeValue(session.datetimeEnd) : "");
    return <Card variant="outlined" sx={{ mb: 2 }}><CardContent><Stack spacing={2}>
        <Typography variant="h6">Session details</Typography>
        {session.timeUnknown
            ? <Alert severity="info">{TIME_UNKNOWN_LABEL}. This workout was imported without a reliable start or end, so there are no times to show or edit.</Alert>
            : <>
                <TextField label="Start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="End" type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </>}
        <TextField label="Notes" multiline minRows={3} value={notes} onChange={event => setNotes(event.target.value)} />
        <Button variant="contained" onClick={async () => { await editSession(session.timeUnknown ? WorkoutSession.clone(session, { notes }) : WorkoutSession.clone(session, { notes, datetimeStart: parseLocalDateTime(start), datetimeEnd: end ? parseLocalDateTime(end) : null })); await onSaved(); }}>Save session details</Button>
    </Stack></CardContent></Card>;
};
export const ExerciseDemoLink = ({ exercise }: { exercise: Exercise }) => {
    const { lang = "en" } = useParams();
    const queryClient = useQueryClient();
    const video = exercise.videos?.find(item => item.isMain) ?? exercise.videos?.[0];
    const [videoUrl, setVideoUrl] = useState("");
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const saveVideo = async () => {
        if (videoFile) await postExerciseVideo({ exerciseId: exercise.id!, author: "Athlete upload", video: videoFile });
        else if (videoUrl.trim()) await axios.post(makeUrl("video"), { exercise: exercise.id, source_url: videoUrl.trim(), license_author: "Athlete link" }, { headers: makeHeader() });
        else return;
        await queryClient.invalidateQueries({ queryKey: [QueryKey.EXERCISES] });
        setStatus("Demo saved"); setVideoUrl(""); setVideoFile(null);
    };
    return <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {exercise.mainImage && <img src={exercise.mainImage.url} alt="" width={56} height={56} style={{ objectFit: "cover", borderRadius: 6 }} />}
            <Button component={Link} to={`/${lang}/exercise/${exercise.id}/view`}>{video ? "Watch demo" : "Exercise details"}</Button>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField size="small" label="Demo video link" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} />
            <Button component="label" variant="outlined">Choose video<input hidden type="file" accept="video/mp4,video/webm,video/ogg" onChange={event => setVideoFile(event.target.files?.[0] ?? null)} /></Button>
            <Button variant="outlined" disabled={!videoFile && !videoUrl.trim()} onClick={saveVideo}>Save demo</Button>
        </Stack>
        {videoFile && <Typography variant="caption">{videoFile.name}</Typography>}{status && <Alert severity="success">{status}</Alert>}
    </Stack>;
};

export const QuickWorkout = () => {
    const { lang = "en" } = useParams();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [name, setName] = useState("Quick workout");
    const [repetitions, setRepetitions] = useState("");
    const [weight, setWeight] = useState("");
    const [rir, setRir] = useState("");
    const [cardio, setCardio] = useState<CardioInput>(EMPTY_CARDIO_INPUT);
    const [averageSpeed, setAverageSpeed] = useState("");
    const [pace, setPace] = useState("");
    const [saved, setSaved] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cardioField = (field: keyof CardioInput) => ({
        value: cardio[field],
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCardio({ ...cardio, [field]: event.target.value }),
    });
    const number = (text: string) => text.trim() === "" ? null : Number(text);
    const invalid = !validDuration(cardio.time) || !validDecimal(cardio.distance, LIMITS.distance) || !validDecimal(cardio.maxSpeed, LIMITS.maxSpeed)
        || !validDecimal(cardio.incline, LIMITS.incline) || !validDecimal(cardio.level, LIMITS.level) || !validDecimal(cardio.calories, LIMITS.calories)
        || [repetitions, weight, rir, averageSpeed, pace].some(text => Number.isNaN(Number(text)));
    const save = async () => {
        if (!exercise || invalid) return;
        setError(null);
        const now = new Date();
        // One performed set is one log holding all its metrics at once
        const metrics = cardioFieldsOf(cardio, REP_UNIT_REPETITIONS, number(repetitions));
        const entry = {
            date: now.toISOString(), iteration: null, exercise: exercise.id!, day: null, routine: null, slot_entry: null,
            repetitions_unit: REP_UNIT_REPETITIONS, repetitions: metrics.repetitions,
            weight_unit: WEIGHT_UNIT_KG, weight: number(weight),
            rir: number(rir),
            ...cardioJson({ ...metrics, averageSpeed: number(averageSpeed), pace: number(pace) }),
        };
        if (Object.entries(entry).every(([key, value]) => ["date", "exercise", "repetitions_unit", "weight_unit", "distance_unit"].includes(key) || value === null)) {
            setError("Enter at least one value.");
            return;
        }
        try {
            const session = await addSession(new WorkoutSession({ id: null, dayId: null as unknown as number, routineId: null as unknown as number, notes: name, impression: "2", datetimeStart: now, datetimeEnd: null }));
            await addLogs([{ ...entry, session: session.id }]);
            await queryClient.invalidateQueries({ queryKey: [QueryKey.SESSIONS_FULL] });
            setSaved(session.id);
        } catch {
            setError("Could not save the workout.");
        }
    };
    if (saved) return <Box sx={{ p: 2 }}><Alert severity="success">Workout saved.</Alert><Button component={Link} to={makeLink(WgerLink.SESSION_DETAIL, lang, { id: saved })}>Open workout</Button></Box>;
    return <Box sx={{ maxWidth: 700, mx: "auto", p: 2 }}><Stack spacing={2}>
        <Typography variant="h4">Log a workout</Typography><Typography>No routine picker. Add what you did and save.</Typography>
        <TextField label="Workout name" value={name} onChange={event => setName(event.target.value)} />
        <NameAutocompleter callback={setExercise} />
        {exercise && <ExerciseDemoLink exercise={exercise} />}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Reps" inputMode="decimal" value={repetitions} onChange={event => setRepetitions(event.target.value)} />
            <TextField label="Weight (kg)" inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} />
            <TextField label="RiR" inputMode="decimal" value={rir} onChange={event => setRir(event.target.value)} />
        </Stack>
        <Typography variant="h6">Cardio / erg metrics</Typography>
        <Typography variant="caption">All metrics are saved together on this one set.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label={t('routines.cardioTime')} placeholder="00:00:00" inputMode="numeric" error={!validDuration(cardio.time)} {...cardioField("time")} />
            <Stack direction="row" spacing={1}>
                <TextField label={t('routines.cardioDistance')} inputMode="decimal" error={!validDecimal(cardio.distance, LIMITS.distance)} {...cardioField("distance")} />
                <TextField select label={t('unit')} sx={{ minWidth: 80 }} value={cardio.distanceUnitId} onChange={event => setCardio({ ...cardio, distanceUnitId: Number(event.target.value) })}>
                    {DISTANCE_UNIT_OPTIONS.map(option => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
                </TextField>
            </Stack>
            <TextField label={t('routines.cardioMaxSpeed')} inputMode="decimal" error={!validDecimal(cardio.maxSpeed, LIMITS.maxSpeed)} {...cardioField("maxSpeed")} />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label={t('routines.cardioIncline')} inputMode="decimal" error={!validDecimal(cardio.incline, LIMITS.incline)} {...cardioField("incline")} />
            <TextField label={t('routines.cardioLevel')} inputMode="decimal" error={!validDecimal(cardio.level, LIMITS.level)} {...cardioField("level")} />
            <TextField label={t('routines.cardioCalories')} inputMode="decimal" error={!validDecimal(cardio.calories, LIMITS.calories)} {...cardioField("calories")} />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Average speed (kph)" inputMode="decimal" value={averageSpeed} onChange={event => setAverageSpeed(event.target.value)} />
            <TextField label="Pace (seconds/km)" inputMode="decimal" value={pace} onChange={event => setPace(event.target.value)} />
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" disabled={!exercise || invalid} onClick={save}>Save workout</Button>
    </Stack></Box>;
};
