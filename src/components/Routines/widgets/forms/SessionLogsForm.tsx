import { WgerTextField } from "@/core/forms/WgerTextField";
import { LoadingPlaceholder } from "@/core/ui/LoadingWidget/LoadingWidget";
import { Exercise, getLanguageByShortName, NameAutocompleter, useLanguageQuery } from "@/components/Exercises";
import { RIR_VALUES_SELECT } from "@/components/Routines/models/BaseConfig";
import { LogEntryForm, cardioJson } from "@/components/Routines/models/WorkoutLog";
import {
    cardioFieldsOf,
    cardioMetrics,
    LIMITS,
    DISTANCE_UNIT_OPTIONS,
    DISTANCE_UNITS,
    EMPTY_CARDIO_INPUT,
    hasCardioInput,
    isCardioPlan,
    lastSessionLogs,
    primaryText,
    speedLabel,
    SPEED_UNITS,
    TIME_UNITS,
    validDecimal,
    validDuration
} from "@/components/Routines/models/cardio";
import { useAddRoutineLogsQuery, useRoutineDetailQuery, useSessionOfDay, useSessionsQuery } from "@/components/Routines/queries";
import { editSession } from "@/components/Routines/api/session";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { ExerciseDemoLink } from "@/components/Routines/widgets/WaveThree";
import { REP_UNIT_REPETITIONS, SNACKBAR_AUTO_HIDE_DURATION } from "@/core/lib/consts";
import { SwapHoriz } from "@mui/icons-material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { Alert, Button, IconButton, InputAdornment, MenuItem, Snackbar, TextField, Typography } from "@mui/material";
import Grid from '@mui/material/Grid';
import { FieldArray, Form, Formik, FormikProps, useField } from "formik";
import { DateTime } from "luxon";
import React, { useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import * as yup from "yup";

// A cardio set gets these inputs instead of reps/weight/RiR; a reps input only
// when the plan counts repetitions (e.g. burpees in the cardio category)
const CardioSetFields = ({ index, log }: { index: number, log: LogEntryForm }) => {
    const { t } = useTranslation();
    const [distanceUnit] = useField(`logs.${index}.distanceUnitId`);
    const decimal = { slotProps: { htmlInput: { inputMode: 'decimal' as const } } };
    const countsReps = ![...TIME_UNITS, ...DISTANCE_UNITS].includes(log.repetitionsUnit?.id ?? -1);
    return <>
        {countsReps && <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.repetitions`} title={t('routines.reps')} fieldProps={decimal} />
        </Grid>}
        <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.time`} title={t('routines.cardioTime')} fieldProps={{ placeholder: "00:00:00", slotProps: { htmlInput: { inputMode: 'numeric' } } }} />
        </Grid>
        <Grid size={{ xs: 4, sm: 3 }}>
            <WgerTextField fieldName={`logs.${index}.distance`} title={t('routines.cardioDistance')} fieldProps={decimal} />
        </Grid>
        <Grid size={{ xs: 2, sm: 1 }}>
            <TextField fullWidth select variant="standard" label={t('unit')} {...distanceUnit}>
                {DISTANCE_UNIT_OPTIONS.map(option => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
            </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.maxSpeed`} title={t('routines.cardioMaxSpeed')} fieldProps={decimal} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.incline`} title={t('routines.cardioIncline')} fieldProps={decimal} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.level`} title={t('routines.cardioLevel')} fieldProps={decimal} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
            <WgerTextField fieldName={`logs.${index}.calories`} title={t('routines.cardioCalories')} fieldProps={decimal} />
        </Grid>
    </>;
};

// What the plan asks of this set, never copied into the inputs
const targetText = (log: LogEntryForm) => {
    const parts = [];
    if (log.repetitionsTarget !== null && log.repetitionsTarget !== '') parts.push(primaryText(Number(log.repetitionsTarget), log.repetitionsUnit?.id ?? null, log.repetitionsUnit?.name));
    if (log.weightTarget !== null && log.weightTarget !== '' && SPEED_UNITS.includes(log.weightUnit?.id ?? -1)) parts.push(`max speed ${log.weightTarget} ${speedLabel(log.weightUnit!.id)}`);
    return parts.join(" · ");
};

const isCardioRow = (log: LogEntryForm) => isCardioPlan(log.exercise, log.repetitionsUnit?.id);
const initialDistanceUnit = (repetitionUnitId: number | undefined) =>
    DISTANCE_UNITS.includes(repetitionUnitId ?? -1) ? repetitionUnitId! : EMPTY_CARDIO_INPUT.distanceUnitId;

interface SessionLogsFormProps {
    dayId: number,
    routineId: number,
    selectedDate: DateTime,
    chosenSessionId: string | null,
}

export const SessionLogsForm = ({ dayId, routineId, selectedDate, chosenSessionId }: SessionLogsFormProps) => {

    const { t, i18n } = useTranslation();
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const routineQuery = useRoutineDetailQuery(routineId);
    const sessionsQuery = useSessionsQuery();
    // The session the form above works on, so the logs end up in the one the
    // user has in front of them. Without it the server would sort them into a
    // session by their time, which on a day with several of them is a guess
    const { session } = useSessionOfDay(routineId, dayId, selectedDate, chosenSessionId);
    const addLogsQuery = useAddRoutineLogsQuery(routineId);
    const languageQuery = useLanguageQuery();
    const handleSnackbarClose = () => setSnackbarOpen(false);
    const [exerciseIdToSwap, setExerciseIdToSwap] = useState<number | null>(null);

    // Counter for the keys of the logs the user adds on top of the planned ones
    const extraLogKey = useRef(0);
    const pendingSubstitution = useRef<string | null>(null);

    let language = undefined;
    if (languageQuery.isSuccess) {
        language = getLanguageByShortName(
            i18n.language,
            languageQuery.data!
        );
    }

    if (routineQuery.isLoading) {
        return <LoadingPlaceholder />;
    }

    const routine = routineQuery.data!;
    const iterationDayData = routine?.getDayData(dayId, selectedDate.toJSDate()) ?? [];
    const hasNoIterationData = iterationDayData.length === 0;

    const validationSchema = yup.object({
        logs: yup.array().of(
            yup.object().shape({
                rir: yup.number().nullable(),
                repetitions: yup.number().typeError(t('forms.enterNumber')).nullable(),
                weight: yup.number().typeError(t('forms.enterNumber')).nullable(),
                time: yup.string().test('duration', 'Use hh:mm:ss, e.g. 00:10:00', validDuration),
                distance: yup.string().test('decimal', 'Up to 3 decimals', value => validDecimal(value, LIMITS.distance)),
                maxSpeed: yup.string().test('decimal', 'Up to 2 decimals', value => validDecimal(value, LIMITS.maxSpeed)),
                incline: yup.string().test('decimal', 'Up to 2 decimals', value => validDecimal(value, LIMITS.incline)),
                level: yup.string().test('decimal', 'Up to 1 decimal', value => validDecimal(value, LIMITS.level)),
                calories: yup.string().test('decimal', 'Up to 2 decimals', value => validDecimal(value, LIMITS.calories)),
            })
        ),
    });

    const handleSubmit = async (values: { logs: LogEntryForm[] }) => {
        const iteration = hasNoIterationData ? null : iterationDayData[0].iteration;
        const data = values.logs
            .filter(l => l.rir !== '' || l.repetitions !== '' || l.weight !== '' || (isCardioRow(l) && hasCardioInput(l)))
            .map(l => {
                // A cardio set is one log with all its metrics, never one row per metric
                const cardio = isCardioRow(l) ? cardioFieldsOf(l, l.repetitionsUnit?.id ?? null, l.repetitions !== '' ? Number(l.repetitions) : null) : null;
                return {
                    date: selectedDate.toISO(),
                    session: session?.id,
                    iteration: iteration,
                    exercise: l.exercise?.id,
                    day: dayId,
                    routine: routineId,
                    // eslint-disable-next-line camelcase
                    slot_entry: l.slotEntry,

                    rir: l.rir !== '' ? l.rir : null,
                    // eslint-disable-next-line camelcase
                    rir_target: l.rirTarget !== '' ? l.rirTarget : null,

                    // eslint-disable-next-line camelcase
                    repetitions_unit: l.repetitionsUnit?.id,
                    repetitions: cardio ? cardio.repetitions : l.repetitions !== '' ? l.repetitions : null,
                    // eslint-disable-next-line camelcase
                    repetitions_target: l.repetitionsTarget !== '' ? l.repetitionsTarget : null,

                    // eslint-disable-next-line camelcase
                    weight_unit: l.weightUnit?.id,
                    weight: l.weight !== '' ? l.weight : null,
                    // eslint-disable-next-line camelcase
                    weight_target: l.weightTarget !== '' ? l.weightTarget : null,

                    ...(cardio ? cardioJson({ ...cardio, averageSpeed: null, pace: null }) : {}),
                };
            });

        await addLogsQuery.mutateAsync(data);
        if (session && pendingSubstitution.current) {
            await editSession(WorkoutSession.clone(session, { notes: `${session.notes ?? ""}
${pendingSubstitution.current}`.trim() }));
            pendingSubstitution.current = null;
        }
        setSnackbarOpen(true);
    };

    const sessions = sessionsQuery.data ?? [];
    const previousFor = (exerciseId: number) => lastSessionLogs(exerciseId, sessions, session).at(-1);
    // Set n of this cardio exercise last time, for comparing set by set
    const previousCardio = (index: number, logs: LogEntryForm[]) => {
        const exerciseId = logs[index].exercise!.id!;
        const setNumber = logs.slice(0, index).filter(log => log.exercise?.id === exerciseId).length;
        const previous = lastSessionLogs(exerciseId, sessions, session)[setNumber];
        return previous ? cardioMetrics(previous).join(" · ") : "";
    };

    const handleCallback = async (exercise: Exercise | null, formik: FormikProps<{
        logs: LogEntryForm[]
    }>) => {

        if (exercise === null) {
            return;
        }

        const reason = window.prompt("Why are you substituting this exercise?", "");
        if (reason === null) return;
        const originalName = formik.values.logs.find(log => exerciseIdToSwap === log.exercise!.id)?.exercise?.getTranslation(language).name;
        pendingSubstitution.current = originalName ? `Substitution: ${exercise.getTranslation(language).name} for ${originalName}. Reason: ${reason}` : null;
        const updatedLogs = formik.values.logs.map((log) => {
            if (exerciseIdToSwap === log.exercise!.id) {
                // Empty the rest of the values, this is a new exercise not in the routine
                return {
                    ...log,
                    ...EMPTY_CARDIO_INPUT,
                    weight: '',
                    weightTarget: '',
                    repetitions: '',
                    repetitionsTarget: '',
                    rir: '',
                    rirTarget: '',
                    exercise: exercise,
                };
            }
            return log;
        });

        await formik.setValues({
            ...formik.values,
            logs: updatedLogs
        });

        setExerciseIdToSwap(null);
    };

    // Compute initial values
    const initialValues = {
        logs: [] as LogEntryForm[]
    };

    const dayDataList = hasNoIterationData ? routine.dayDataCurrentIteration.filter(dayData => dayData.day?.id === dayId) : iterationDayData;

    for (const dayData of dayDataList) {
        for (const slot of dayData.slots) {
            for (const config of slot.setConfigs) {
                for (let i = 0; i < config.nrOfSets; i++) {
                    // Planned cardio values are targets only; the inputs start empty
                    const prefill = !hasNoIterationData && !isCardioPlan(config.exercise, config.repetitionsUnitId);

                    initialValues.logs.push({
                        clientKey: `${dayData.iteration}-${config.slotEntryId}-${config.exerciseId}-${i}`,
                        exercise: config.exercise!,
                        repetitionsUnit: config.repetitionsUnit!,
                        weightUnit: config.weightUnit!,
                        slotEntry: config.slotEntryId,

                        rir: prefill && config.rir !== null ? config.rir : '',
                        rirTarget: !hasNoIterationData && config.rir !== null ? config.rir : '',
                        repetitions: prefill && config.repetitions !== null ? config.repetitions : '',
                        repetitionsTarget: !hasNoIterationData && config.repetitions !== null ? config.repetitions : '',
                        weight: prefill && config.weight !== null ? config.weight : '',
                        weightTarget: !hasNoIterationData && config.weight !== null ? config.weight : '',
                        rest: '',
                        restTarget: '',
                        ...EMPTY_CARDIO_INPUT,
                        distanceUnitId: initialDistanceUnit(config.repetitionsUnitId ?? undefined),
                    });
                }
            }
        }
    }

    return (<>
        {hasNoIterationData &&
            <Alert severity={'info'} sx={{ marginTop: 2 }}>{t('routines.weightLogNotPlanned')}</Alert>
        }


        <Formik
            enableReinitialize
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
        >
            {formik => (
                <Form>
                    <FieldArray name={"logs"}>
                        {({ insert, remove }) => (<>
                                <Alert severity="info">Added or removed sets affect this session only. Skipped rows are not saved as zeroes.</Alert>

                                {formik.values.logs.map((log, index) => (
                                    <Grid container key={log.clientKey} spacing={1} sx={{ mt: 2 }}>

                                        {/* Only show the exercise name the first time it appears */}
                                        {(index === 0 || (index > 0 && formik.values.logs[index - 1].exercise!.id !== formik.values.logs[index].exercise!.id)) && <>
                                            <Grid size={12}>
                                                {exerciseIdToSwap !== formik.values.logs[index].exercise!.id && <>
                                                    <Typography variant="h6">{formik.values.logs[index].exercise?.getTranslation(language).name}</Typography>
                                                    <ExerciseDemoLink exercise={formik.values.logs[index].exercise!} />
                                                    {!isCardioRow(log) && previousFor(log.exercise!.id!) && <Typography color="text.secondary">Previous: {previousFor(log.exercise!.id!)?.repetitions ?? "—"} reps × {previousFor(log.exercise!.id!)?.weight ?? "—"} {previousFor(log.exercise!.id!)?.weightUnitObj?.name ?? ""}</Typography>}
                                                </>}

                                                {exerciseIdToSwap === formik.values.logs[index].exercise!.id &&
                                                    <NameAutocompleter
                                                        callback={(searchResponse) => handleCallback(searchResponse, formik)}
                                                    />}

                                            </Grid>
                                            <Grid size={12}>
                                                <Button
                                                    type="button"
                                                    size="small"
                                                    onClick={() => insert(index, {
                                                        clientKey: `extra-${extraLogKey.current++}`,
                                                        exercise: formik.values.logs[index].exercise,
                                                        repetitions: formik.values.logs[index].repetitions,
                                                        repetitionsTarget: formik.values.logs[index].repetitionsTarget ?? "",
                                                        repetitionsUnit: formik.values.logs[index].repetitionsUnit,
                                                        weight: formik.values.logs[index].weight,
                                                        weightTarget: formik.values.logs[index].weightTarget ?? "",
                                                        weightUnit: formik.values.logs[index].weightUnit,
                                                        rir: formik.values.logs[index].rir,
                                                        rirTarget: formik.values.logs[index].rirTarget ?? "",
                                                        rest: formik.values.logs[index].rest ?? "",
                                                        restTarget: formik.values.logs[index].restTarget ?? "",
                                                        slotEntry: null,
                                                        ...EMPTY_CARDIO_INPUT,
                                                        distanceUnitId: formik.values.logs[index].distanceUnitId,
                                                    })}
                                                >
                                                    <AddIcon />
                                                    {t('routines.addAdditionalLog')}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="small"
                                                    onClick={() => {
                                                        if (exerciseIdToSwap === formik.values.logs[index].exercise!.id) {
                                                            setExerciseIdToSwap(null);
                                                        } else {
                                                            setExerciseIdToSwap(formik.values.logs[index].exercise!.id);
                                                        }
                                                    }}
                                                >
                                                    <SwapHoriz />
                                                    {t('exercises.swapExercise')}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="small"
                                                    onClick={async () => await formik.setValues({
                                                        ...formik.values,
                                                        logs: formik.values.logs.filter(l => l.exercise!.id !== formik.values.logs[index].exercise!.id)
                                                    })}
                                                >
                                                    <DeleteIcon />
                                                    {t('delete')}
                                                </Button>

                                            </Grid>
                                        </>}
                                        {isCardioRow(log) ? <>
                                            {/* Plan and last time sit apart from the actual inputs and are never copied into them */}
                                            <Grid size={12}>
                                                {targetText(log) && <Typography variant="body2" color="text.secondary">Target: {targetText(log)}</Typography>}
                                                {previousCardio(index, formik.values.logs) && <Typography variant="body2" color="text.secondary">Previous: {previousCardio(index, formik.values.logs)}</Typography>}
                                            </Grid>
                                            <CardioSetFields index={index} log={log} />
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <TextField fullWidth select label={t('routines.rir')} variant="standard" {...formik.getFieldProps(`logs.${index}.rir`)}>
                                                    {RIR_VALUES_SELECT.map((option) => (
                                                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                                    ))}
                                                </TextField>
                                            </Grid>
                                            <Grid size={1}>
                                                <IconButton size={"small"} aria-label="Remove set" onClick={() => remove(index)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Grid>
                                        </> : <>
                                        <Grid size={4}>
                                            <WgerTextField
                                                fieldName={`logs.${index}.repetitions`}
                                                title={t('server.repetitions')}
                                                fieldProps={{
                                                    slotProps: {
                                                        input: {
                                                            endAdornment:
                                                                <InputAdornment position="end">
                                                                    {/* Only show reps that are not "repetitions" */}
                                                                    {formik.values.logs[index].repetitionsUnit?.id !== REP_UNIT_REPETITIONS
                                                                        ? <Typography variant={'caption'}>
                                                                            {formik.values.logs[index].repetitionsUnit?.name}
                                                                        </Typography>
                                                                        : null}
                                                                </InputAdornment>
                                                        },
                                                        htmlInput: {
                                                            inputMode: 'decimal'
                                                        }
                                                    }
                                                }}
                                            />
                                        </Grid>
                                        <Grid size={4}>
                                            <WgerTextField
                                                fieldName={`logs.${index}.weight`}
                                                title={t('weight')}
                                                fieldProps={{
                                                    slotProps: {
                                                        input: {
                                                            endAdornment:
                                                                <InputAdornment position="end">
                                                                    <Typography variant={'caption'}>
                                                                        {formik.values.logs[index].weightUnit?.name}
                                                                    </Typography>
                                                                </InputAdornment>
                                                        },
                                                        htmlInput: {
                                                            inputMode: 'decimal'
                                                        }
                                                    }
                                                }}
                                            />
                                        </Grid>

                                        <Grid size={3}>
                                            <TextField
                                                fullWidth
                                                select
                                                label={t('routines.rir')}
                                                variant="standard"
                                                {...formik.getFieldProps(`logs.${index}.rir`)}
                                            >
                                                {RIR_VALUES_SELECT.map((option) => (
                                                    <MenuItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        </Grid>
                                        <Grid size={1}>
                                            <IconButton size={"small"} onClick={() => remove(index)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </Grid>
                                        </>}
                                    </Grid>
                                ))}
                            </>
                        )}
                    </FieldArray>
                    <Grid container spacing={2}>
                        <Grid size={12} sx={{ display: "flex", justifyContent: "end" }}>
                            <Button
                                color="primary"
                                // disabled={!formik.isValid || formik.isSubmitting || !formik.dirty}
                                disabled={!formik.isValid || formik.isSubmitting || addLogsQuery.isPending}
                                variant="contained"
                                type="submit"
                                sx={{ mt: 2 }}>
                                {t('submit')}
                            </Button>
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
        <Snackbar
            open={snackbarOpen}
            autoHideDuration={SNACKBAR_AUTO_HIDE_DURATION}
            onClose={handleSnackbarClose}
        >
            <Alert onClose={handleSnackbarClose} severity="success" sx={{ width: '100%' }}>
                {t('success')}
            </Alert>
        </Snackbar>
    </>);
};
