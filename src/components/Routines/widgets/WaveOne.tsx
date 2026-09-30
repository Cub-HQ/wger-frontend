import EditIcon from "@mui/icons-material/Edit";
import { Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import { addLogs } from "@/components/Routines/api/workoutLogs";
import { SetConfigData } from "@/components/Routines/models/SetConfigData";
import { cardioJson, WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import { cardioMetrics, isLegacySpeed, isMetricPrimary, lastSessionLogs, primaryText } from "@/components/Routines/models/cardio";
import { TIME_UNKNOWN_LABEL, WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { useRoutineDetailQuery } from "@/components/Routines/queries/routines";
import { useFetchRoutineRepUnitsQuery, useFetchRoutineWeighUnitsQuery } from "@/components/Routines/queries/units";
import { useSessionsQuery } from "@/components/Routines/queries/sessions";
import { ExerciseLog, TimeSeriesChart } from "@/components/Routines/widgets/LogWidgets";
import { QueryKey } from "@/core/lib/consts";
import { dateToLocale } from "@/core/lib/date";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { makeLink, WgerLink } from "@/core/lib/url";
import { ExerciseDemoLink, SessionMetadataEditor, SessionTimer } from "@/components/Routines/widgets/WaveThree";

const withDate = (log: WorkoutLog, date: Date) => Object.assign(Object.create(Object.getPrototypeOf(log)), log, { date: new Date(date.getTime()) }) as WorkoutLog;
// Shown as stored, up to the two decimals the server keeps; never rounded to one
const number = (value: number | null) => value === null ? "—" : Number(value.toFixed(2)).toString();

// "6 reps × 50 kg" for strength; every cardio metric of the set next to it
export const workoutMetrics = (log: WorkoutLog, weightUnit = "") => {
    const load = weightUnit.trim();
    const reps = log.repetitions != null && !isMetricPrimary(log.repetitionUnitId) ? log.repetitions : null;
    // A legacy speed in weight is a speed and shows as Max speed, never as a load
    const weight = isLegacySpeed(log) ? null : log.weight ?? null;
    const unit = load ? ` ${load}` : "";
    const strength = reps !== null && weight !== null
        ? [`${number(reps)} reps × ${number(weight)}${unit}`]
        : [...(reps !== null ? [`${number(reps)} reps`] : []), ...(weight !== null ? [`Load ${number(weight)}${unit}`] : [])];
    return [...strength, ...cardioMetrics(log)];
};
const sessionName = (session: WorkoutSession) => {
    const sourceTitle = session.notes?.match(/^Original source title:\s*(.+)$/im)?.[1]?.trim();
    return sourceTitle || session.dayObj?.name || session.notes?.split(/\r?\n/, 1)[0]?.trim() || session.logs[0]?.exerciseObj?.getTranslation().name || "Workout";
};

const previousLogs = (log: WorkoutLog, sessions: WorkoutSession[]) => {
    const current = sessions.find(session => session.id === log.sessionId);
    return current ? lastSessionLogs(log.exerciseId, sessions, current) : [];
};

export const SetSummary = ({ log, sessions }: { log: WorkoutLog, sessions: WorkoutSession[] }) => {
    const weightUnits = useFetchRoutineWeighUnitsQuery();
    const repetitionUnits = useFetchRoutineRepUnitsQuery();
    const weightUnit = log.weightUnitObj?.name ?? weightUnits.data?.find(item => item.id === log.weightUnitId)?.name ?? "";
    const repetitionUnit = log.repetitionUnitObj?.name ?? repetitionUnits.data?.find(item => item.id === log.repetitionUnitId)?.name ?? "";
    const metrics = workoutMetrics(log, weightUnit);
    const prior = previousLogs(log, sessions);
    const index = Math.max(0, [...(sessions.find(session => session.id === log.sessionId)?.logs ?? [])]
        .filter(entry => entry.exerciseId === log.exerciseId)
        .sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0))
        .findIndex(entry => entry.id === log.id));
    const previous = prior[index] ?? prior.at(-1);
    // Only like with like: the same load unit and the same kind of primary measure
    const loadDelta = previous?.weight != null && log.weight != null && previous.weightUnitId === log.weightUnitId && !isLegacySpeed(log) ? log.weight - previous.weight : null;
    const measureDelta = previous?.repetitions != null && log.repetitions != null && previous.repetitionUnitId === log.repetitionUnitId ? log.repetitions - previous.repetitions : null;
    const delta = loadDelta !== null && loadDelta !== 0
        ? { value: loadDelta, unit: weightUnit }
        : measureDelta !== null && measureDelta !== 0 ? { value: measureDelta, unit: repetitionUnit || "reps" } : null;
    const up = delta !== null && delta.value > 0;
    // Wraps by the width it gets, which in the calendar is a narrow side panel on any screen
    return <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
        <Typography component="span">{metrics.length ? metrics.join(" · ") : "No recorded metrics"}</Typography>
        {delta && <Chip size="small" color={up ? "success" : "error"} label={`${up ? "▲" : "▼"} ${delta.value > 0 ? "+" : ""}${number(delta.value)}${delta.unit ? ` ${delta.unit}` : ""} vs last time`} />}
    </Stack>;
};

export const WorkoutsOverview = () => {
    const { lang = "en" } = useParams();
    const sessionsQuery = useSessionsQuery();
    const [search, setSearch] = useState("");
    const [visible, setVisible] = useState(30);
    const sentinel = useRef<HTMLDivElement>(null);
    const sessions = useMemo(() => [...(sessionsQuery.data ?? [])]
        .sort((a, b) => b.datetimeStart.getTime() - a.datetimeStart.getTime())
        .filter(session => `${sessionName(session)} ${session.logs.map(log => log.exerciseObj?.getTranslation().name ?? "").join(" ")}`.toLowerCase().includes(search.toLowerCase())), [sessionsQuery.data, search]);
    useEffect(() => {
        const node = sentinel.current;
        if (!node) return;
        const observer = new IntersectionObserver(entries => entries[0].isIntersecting && setVisible(count => Math.min(count + 30, sessions.length)));
        observer.observe(node);
        return () => observer.disconnect();
    }, [sessions.length]);
    useEffect(() => setVisible(30), [search]);
    if (sessionsQuery.isLoading) return <CircularProgress />;
    if (sessionsQuery.isError) return <Typography color="error">Could not load workouts.</Typography>;
    return <Box sx={{ maxWidth: 900, mx: "auto", p: 2 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>All workouts</Typography>
        <TextField fullWidth label="Search workout or exercise" value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 2 }} />
        <Stack spacing={1.5}>
            {sessions.slice(0, visible).map(session => <Card key={session.id} variant="outlined">
                <CardActionArea component={Link} to={makeLink(WgerLink.SESSION_DETAIL, lang, { id: session.id! })}>
                    <CardContent>
                        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                            <Box>
                                <Typography variant="h6">{sessionName(session)}</Typography>
                                <Typography color="text.secondary">{dateToLocale(session.datetimeStart)}{session.timeUnknown && ` · ${TIME_UNKNOWN_LABEL}`} · {session.logs.length} entries</Typography>
                            </Box>
                            <Typography color="text.secondary">View</Typography>
                        </Stack>
                        {session.logs.slice(0, 2).map(log => <SetSummary key={log.id} log={log} sessions={sessionsQuery.data ?? []} />)}
                    </CardContent>
                </CardActionArea>
            </Card>)}
            {sessions.length === 0 && <Typography color="text.secondary">No workouts match this search.</Typography>}
            <div ref={sentinel} />
        </Stack>
    </Box>;
};

const range = (low: number | null, high: number | null) => low === null ? null : high !== null && high !== low ? `${number(low)}–${number(high)}` : number(low);

// What the routine asked for, e.g. "4 sets × 8, 90s rest between sets"
export const prescription = (config: SetConfigData) => {
    const unitId = config.repetitionsUnitId;
    // A time or distance target reads as "00:00:20" or "0.5 km"
    const metric = (value: number | null) => value === null ? null : primaryText(value, unitId);
    const reps = isMetricPrimary(unitId)
        ? metric(config.repetitions) && (config.maxRepetitions !== null && config.maxRepetitions !== config.repetitions ? `${metric(config.repetitions)}–${metric(config.maxRepetitions)}` : metric(config.repetitions))
        : range(config.repetitions, config.maxRepetitions);
    const unit = !isMetricPrimary(unitId) && config.repetitionsUnit && !/repetition/i.test(config.repetitionsUnit.name) ? ` ${config.repetitionsUnit.name.toLowerCase()}` : "";
    const rest = range(config.restTime, config.maxRestTime);
    const sets = `${range(config.nrOfSets, config.maxNrOfSets)} ${config.nrOfSets === 1 && config.maxNrOfSets === null ? "set" : "sets"}`;
    return `${sets}${reps ? ` × ${reps}${unit}` : ""}${rest ? `, ${rest}s rest between sets` : ""}`;
};

// One exercise of a logged session: only the sets that were recorded, each
// next to how it compares to the last time the exercise was done
const ExerciseSummary = ({ logs, sessions, target }: { logs: WorkoutLog[], sessions: WorkoutSession[], target: string | null }) => {
    const exercise = logs[0].exerciseObj;
    const name = exercise?.getTranslation().name ?? "Unknown exercise";
    return <Card component="section" aria-label={name} variant="outlined" sx={{ borderLeft: 4, borderLeftColor: "primary.main" }}>
        <CardContent>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 1.5 }}>
                {exercise?.mainImage && <Box component="img" src={exercise.mainImage.url} alt="" sx={{ width: 64, height: 64, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} />}
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2" sx={{ overflowWrap: "anywhere" }}>{name}</Typography>
                    {target && <Typography variant="body2" color="text.secondary">Target: {target}</Typography>}
                </Box>
            </Stack>
            <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
                {logs.map((log, index) => <Stack component="li" key={log.id} direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <Typography color="text.secondary" sx={{ minWidth: 48, flexShrink: 0 }}>Set {index + 1}</Typography>
                    <SetSummary log={log} sessions={sessions} />
                </Stack>)}
            </Stack>
        </CardContent>
    </Card>;
};

// A logged session as one card per exercise, for the calendar's expanded workout
export const SessionSummary = ({ session, sessions }: { session: WorkoutSession, sessions: WorkoutSession[] }) => {
    // Quick logs have no routine, so there is nothing they were prescribed
    const routineQuery = useRoutineDetailQuery(session.routineId ?? 0, Boolean(session.routineId));
    const grouped = new Map<number, WorkoutLog[]>();
    session.logs.forEach(log => grouped.set(log.exerciseId, [...(grouped.get(log.exerciseId) ?? []), log]));
    // Same order SetSummary pairs the sets with the previous session in
    const exercises = Array.from(grouped.values(), logs => [...logs].sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0)));
    const targetOf = (logs: WorkoutLog[]) => {
        const planned = logs.find(log => log.slotEntryId !== null && log.iteration !== null);
        const config = planned && routineQuery.data?.getSetConfigData(session.dayId, planned.iteration!, planned.slotEntryId!);
        return config ? prescription(config) : null;
    };
    return <Stack spacing={2}>
        {exercises.map(logs => <ExerciseSummary key={logs[0].exerciseId} logs={logs} sessions={sessions} target={targetOf(logs)} />)}
        {exercises.length === 0 && <Typography color="text.secondary">No sets were recorded in this workout.</Typography>}
    </Stack>;
};

export const SessionDetail = () => {
    const { sessionId = "" } = useParams();
    const sessionsQuery = useSessionsQuery();
    const queryClient = useQueryClient();
    const session = sessionsQuery.data?.find(item => item.id === sessionId);
    const [adding, setAdding] = useState(false);
    // Edit sets links land on #edit, which only exists once the sessions have loaded
    const { hash } = useLocation();
    const editRef = useRef<HTMLDivElement>(null);
    const loaded = Boolean(session);
    useEffect(() => {
        if (loaded && hash === "#edit") editRef.current?.scrollIntoView();
    }, [loaded, hash]);
    if (sessionsQuery.isLoading) return <CircularProgress />;
    if (!session) return <Typography color="error">Workout session not found.</Typography>;
    const grouped = new Map<number, WorkoutLog[]>();
    session.logs.forEach(log => grouped.set(log.exerciseId, [...(grouped.get(log.exerciseId) ?? []), log]));
    const addSet = async (last: WorkoutLog) => {
        setAdding(true);
        try {
            await addLogs([{ date: session.datetimeStart.toISOString(), iteration: last.iteration, exercise: last.exerciseId, session: session.id, routine: session.routineId, slot_entry: last.slotEntryId, repetitions_unit: last.repetitionUnitId, repetitions: last.repetitions, weight_unit: last.weightUnitId, weight: last.weight, rir: last.rir, rest: last.restTime, ...cardioJson(last) }]);
            await queryClient.invalidateQueries({ queryKey: [QueryKey.SESSIONS_FULL] });
        } finally { setAdding(false); }
    };
    return <Box sx={{ maxWidth: 1100, mx: "auto", p: 2 }}>
        <Typography variant="h4">{sessionName(session)}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{dateToLocale(session.datetimeStart)}{session.timeUnknown && ` · ${TIME_UNKNOWN_LABEL}`} · stable session {session.id}</Typography>
        <SessionTimer session={session} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: [QueryKey.SESSIONS_FULL] }); }} />
        <SessionMetadataEditor session={session} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: [QueryKey.SESSIONS_FULL] }); }} />
        <Button startIcon={<EditIcon />} href="#edit" variant="contained" sx={{ mb: 2 }}>Edit workout sets</Button>
        <Divider />
        <Box id="edit" ref={editRef}>
            {Array.from(grouped.values()).map(logs => <Box key={logs[0].exerciseId} sx={{ mb: 3 }}>
                <ExerciseDemoLink exercise={logs[0].exerciseObj!} />
                <ExerciseLog
                    exercise={logs[0].exerciseObj!}
                    routineId={session.routineId}
                    logEntries={logs}
                    displayDate={session.datetimeStart}
                    chartEntries={(sessionsQuery.data ?? []).flatMap(candidate =>
                        candidate.logs.filter(log => log.exerciseId === logs[0].exerciseId)
                            .map(log => withDate(log, candidate.datetimeStart))
                    ).sort((a, b) => a.date.getTime() - b.date.getTime())}
                />
                <Typography variant="caption">Planned {logs.filter(log => log.slotEntryId !== null).length} · completed {logs.length}</Typography>
                <Button disabled={adding} onClick={() => addSet(logs.at(-1)!)}>+ Add set</Button>
            </Box>)}
        </Box>
    </Box>;
};

export const ExerciseProgression = ({ exerciseId }: { exerciseId: number }) => {
    const { lang = "en" } = useParams();
    const sessionsQuery = useSessionsQuery();
    const logs = useMemo(() => (sessionsQuery.data ?? []).flatMap(session => session.logs
        .map(log => withDate(log, session.datetimeStart)))
        .filter(log => log.exerciseId === exerciseId)
        .sort((a, b) => a.date.getTime() - b.date.getTime()), [sessionsQuery.data, exerciseId]);
    if (sessionsQuery.isLoading) return <CircularProgress />;
    return <Box sx={{ mt: 4 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>Your progression</Typography>
        {logs.length === 0 ? <Typography color="text.secondary">No recorded sets for this exercise yet.</Typography> : <>
            <TimeSeriesChart data={logs} />
            <Stack divider={<Divider />}>
                {[...logs].reverse().map(log => <Box key={log.id} sx={{ py: 1 }}>
                    <Typography component={Link} to={makeLink(WgerLink.SESSION_DETAIL, lang, { id: log.sessionId! })} sx={{ fontWeight: 600 }}>{dateToLocale(log.date)}</Typography>
                    <SetSummary log={log} sessions={sessionsQuery.data ?? []} />
                </Box>)}
            </Stack>
        </>}
    </Box>;
};
