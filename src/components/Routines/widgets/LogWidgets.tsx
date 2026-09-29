import CancelIcon from "@mui/icons-material/Cancel";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Box, Card, CardContent, InputAdornment, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import Grid from "@mui/material/Grid";
import {
    DataGrid,
    GridActionsCellItem,
    GridColDef,
    GridEventListener,
    GridRowEditStopReasons,
    GridRowId,
    GridRowModel,
    GridRowModes,
    GridRowModesModel,
    GridEditInputCell,
    GridRowsProp
} from "@mui/x-data-grid";
import { FormQueryErrors } from "@/core/ui/Widgets/FormError";
import { Exercise } from "@/components/Exercises";
import { RIR_VALUES_SELECT_LIST } from "@/components/Routines/models/BaseConfig";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
import {
    DISTANCE_UNIT_OPTIONS,
    distanceLabel,
    formatDuration,
    hasCardioMetrics,
    isCardioPlan,
    weightUnitIsSpeed,
    isMetricPrimary,
    LIMITS,
    logDistance,
    logMaxSpeed,
    logSeconds,
    parseDuration,
    speedLabel,
    validDecimal,
    validDuration,
    withDistance,
    withMaxSpeed,
    withTime
} from "@/components/Routines/models/cardio";
import { useDeleteRoutineLogQuery, useEditRoutineLogQuery } from "@/components/Routines/queries";
import { DateTime } from "luxon";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    CartesianGrid,
    Legend,
    Scatter,
    ScatterChart,
    Tooltip,
    TooltipContentProps,
    XAxis,
    YAxis
} from "recharts";
import { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { generateChartColors } from "@/core/lib/colors";
import {
    PAGINATION_OPTIONS,
    REP_UNIT_KILOMETERS,
    REP_UNIT_METERS,
    REP_UNIT_MILES,
    REP_UNIT_MINUTES,
    REP_UNIT_REPETITIONS,
    REP_UNIT_SECONDS,
    REP_UNIT_TILL_FAILURE,
    WEIGHT_UNIT_KG,
    WEIGHT_UNIT_KMH,
    WEIGHT_UNIT_LB,
    WEIGHT_UNIT_MPH
} from "@/core/lib/consts";
import { dateToLocale } from "@/core/lib/date";
import {
    filterProgressionChartData,
    loadProgressionChartRange,
    PROGRESSION_CHART_RANGES,
    sessionKey
} from "@/components/Routines/widgets/progressionChartRange";

// Decimal cardio columns: field, header translation key, the server's limits, optional unit label
type CardioHeaderKey = 'routines.cardioDistance' | 'routines.cardioMaxSpeedShort' | 'routines.cardioInclineShort' | 'routines.cardioLevelShort' | 'routines.cardioCaloriesShort';
const DECIMAL_COLUMNS: readonly [string, CardioHeaderKey, { places: number, below: number }, ((row: GridRowModel) => string)?][] = [
    ['distance', 'routines.cardioDistance', LIMITS.distance],
    ['maxSpeed', 'routines.cardioMaxSpeedShort', LIMITS.maxSpeed, row => speedLabel(row.maxSpeedUnitId ?? WEIGHT_UNIT_KMH)],
    ['incline', 'routines.cardioInclineShort', LIMITS.incline],
    ['level', 'routines.cardioLevelShort', LIMITS.level],
    ['calories', 'routines.cardioCaloriesShort', LIMITS.calories],
];


export const ExerciseLog = (props: { exercise: Exercise, routineId: number, logEntries: WorkoutLog[] | undefined, chartEntries?: WorkoutLog[], displayDate?: Date, displayDates?: Map<string, Date> }) => {
    const { t } = useTranslation();
    const logEntries = props.logEntries ?? [];
    const deleteLogQuery = useDeleteRoutineLogQuery(props.routineId);
    const editLogQuery = useEditRoutineLogQuery(props.routineId);

    // Cardio logs show every metric of the set; a strength table stays as it was
    const cardio = isCardioPlan(props.exercise, null) || logEntries.some(hasCardioMetrics);

    const rowOf = (logEntry: WorkoutLog, date: Date) => {
        const seconds = logSeconds(logEntry);
        const distance = logDistance(logEntry);
        const speed = logMaxSpeed(logEntry);
        return {
            id: logEntry.id,
            date,
            // A time or distance held as the primary measure is shown and edited in its own column only
            repetitions: cardio && isMetricPrimary(logEntry.repetitionUnitId) ? null : logEntry.repetitions,
            primaryIsMetric: cardio && isMetricPrimary(logEntry.repetitionUnitId),
            // A weight in km/h or mph is a speed, never shown or edited as a load, also once emptied
            weight: weightUnitIsSpeed(logEntry) ? null : logEntry.weight,
            weightIsSpeed: weightUnitIsSpeed(logEntry),
            rir: logEntry.rir,
            time: seconds === null ? "" : formatDuration(seconds),
            distance: distance?.value ?? null,
            distanceUnitId: distance?.unitId ?? REP_UNIT_KILOMETERS,
            maxSpeed: speed?.value ?? null,
            // Empty, the speed is still edited in the unit it will be saved in (a cleared mph speed stays mph)
            maxSpeedUnitId: speed?.unitId ?? (weightUnitIsSpeed(logEntry) ? logEntry.weightUnitId : logEntry.maxSpeedUnitId),
            incline: logEntry.incline,
            level: logEntry.level,
            calories: logEntry.calories,
            entry: logEntry
        };
    };

    const initialRows: GridRowsProp = logEntries.map((logEntry: WorkoutLog) => rowOf(
        logEntry,
        props.displayDates?.has(logEntry.id) ? new Date(props.displayDates.get(logEntry.id)!.getTime()) : props.displayDate ? new Date(props.displayDate.getTime()) : logEntry.date
    ));


    const [rows, setRows] = React.useState(initialRows);
    const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});
    const [rowError, setRowError] = React.useState<string | null>(null);

    const handleRowEditStop: GridEventListener<'rowEditStop'> = (params, event) => {
        if (params.reason === GridRowEditStopReasons.rowFocusOut) {
            event.defaultMuiPrevented = true;
        }
    };

    const handleEditClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
    };

    const handleSaveClick = (id: GridRowId) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    };

    const handleDeleteClick = (id: GridRowId) => () => {
        deleteLogQuery.mutate(id.toString());
        setRows(rows.filter((row) => row.id !== id));
    };

    const handleCancelClick = (id: GridRowId) => () => {
        setRowModesModel({
            ...rowModesModel,
            [id]: { mode: GridRowModes.View, ignoreModifications: true },
        });

        const editedRow = rows.find((row) => row.id === id);
        if (editedRow!.isNew) {
            setRows(rows.filter((row) => row.id !== id));
        }
    };

    // Checked here, not per cell: a pending per-cell check makes the grid drop the save silently.
    // Throwing keeps the row in edit mode with the message shown.
    const invalidFields = (row: GridRowModel) => cardio ? [
        ...(validDuration(row.time) ? [] : [t('routines.cardioTimeShort')]),
        ...DECIMAL_COLUMNS.filter(([field, , limit]) => row[field] != null && !validDecimal(String(row[field]), limit)).map(([, key]) => t(key)),
    ] : [];

    // Only what was edited is written back; untouched values, units and metrics stay as stored.
    // Edits go to a copy and the row counts as saved only once the server took it, so a
    // failed save leaves the cached log as it was and the row open with the error shown.
    const processRowUpdate = async (newRow: GridRowModel, oldRow: GridRowModel) => {
        const invalid = invalidFields(newRow);
        if (invalid.length > 0) throw new RangeError(`Check ${invalid.join(', ')}: too many decimal places or too large`);
        setRowError(null);

        const original: WorkoutLog = newRow.entry;
        const log = Object.assign(Object.create(Object.getPrototypeOf(original)), original) as WorkoutLog;
        if (newRow.date.getTime() !== oldRow.date.getTime()) log.date = newRow.date;
        if (newRow.repetitions !== oldRow.repetitions) log.repetitions = newRow.repetitions;
        if (newRow.weight !== oldRow.weight) log.weight = newRow.weight;
        if (newRow.rir !== oldRow.rir) log.rir = newRow.rir;
        if (newRow.time !== oldRow.time) Object.assign(log, withTime(log, parseDuration(newRow.time ?? "")));
        if (newRow.distance !== oldRow.distance || newRow.distanceUnitId !== oldRow.distanceUnitId) {
            Object.assign(log, withDistance(log, newRow.distance, newRow.distanceUnitId));
        }
        if (newRow.maxSpeed !== oldRow.maxSpeed) Object.assign(log, withMaxSpeed(log, newRow.maxSpeed));
        if (newRow.incline !== oldRow.incline) log.incline = newRow.incline;
        if (newRow.level !== oldRow.level) log.level = newRow.level;
        if (newRow.calories !== oldRow.calories) log.calories = newRow.calories;

        // The API error itself is shown by FormQueryErrors above the grid
        await editLogQuery.mutateAsync(log);

        const updatedRow = { ...rowOf(log, newRow.date), isNew: false };
        setRows(current => current.map(row => (row.id === newRow.id ? updatedRow : row)));
        return updatedRow;
    };

    const handleRowModesModelChange = (newRowModesModel: GridRowModesModel) => {
        setRowModesModel(newRowModesModel);
    };

    const decimalColumn = ([field, key, , unit]: typeof DECIMAL_COLUMNS[number]): GridColDef => ({
        field,
        headerName: t(key),
        type: 'number',
        disableColumnMenu: true,
        editable: true,
        minWidth: 90,
        valueFormatter: (value: number | null, row) => value == null ? '' : unit ? `${value} ${unit(row)}` : value,
        // The unit stays visible while editing, also with the value emptied
        ...(unit && { renderEditCell: params => <GridEditInputCell {...params} endAdornment={<InputAdornment position="end">{unit(params.row)}</InputAdornment>} /> }),
    });

    const cardioColumns: GridColDef[] = [
        {
            field: 'time',
            headerName: t('routines.cardioTimeShort'),
            disableColumnMenu: true,
            editable: true,
            minWidth: 100,
        },
        decimalColumn(DECIMAL_COLUMNS[0]),
        {
            field: 'distanceUnitId',
            headerName: t('unit'),
            type: 'singleSelect',
            disableColumnMenu: true,
            editable: true,
            width: 70,
            valueOptions: DISTANCE_UNIT_OPTIONS.map(option => ({ value: option.id, label: option.label })),
            valueFormatter: (value: number) => distanceLabel(value),
        },
        ...DECIMAL_COLUMNS.slice(1).map(decimalColumn),
    ];

    const columns: GridColDef[] = [
        {
            field: 'date',
            type: 'dateTime',
            flex: 1,
            editable: true,
            disableColumnMenu: true,
            headerName: t('date'),
            valueFormatter: (value?: Date) => {
                if (value == null) {
                    return '';
                }
                return `${dateToLocale(value)}`;
            },
        },
        {
            field: 'repetitions',
            type: 'number',
            disableColumnMenu: true,
            editable: true,
            headerName: t('routines.reps'),
        },
        {
            field: 'weight',
            type: 'number',
            disableColumnMenu: true,
            editable: true,
            headerName: t('weight'),
        },
        ...(cardio ? cardioColumns : []),
        {
            field: 'rir',
            type: 'singleSelect',
            disableColumnMenu: true,

            editable: true,
            headerName: t('routines.rir'),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getOptionValue: (value: any) => value.value,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getOptionLabel: (value: any) => value.label,
            valueOptions: RIR_VALUES_SELECT_LIST,
        },
        {
            field: 'actions',
            type: 'actions',
            headerName: 'Actions',
            width: 100,
            cellClassName: 'actions',
            getActions: ({ id }) => {
                const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;

                if (isInEditMode) {
                    return [
                        <GridActionsCellItem
                            key="save"
                            icon={<SaveIcon sx={{ color: 'primary.main' }} />}
                            label={t('save')}
                            onClick={handleSaveClick(id)}
                        />,
                        <GridActionsCellItem
                            key="cancel"
                            icon={<CancelIcon />}
                            label={t('cancel')}
                            className="textPrimary"
                            onClick={handleCancelClick(id)}
                            color="inherit"
                        />,
                    ];
                }

                return [
                    <GridActionsCellItem
                        key="edit"
                        icon={<EditIcon />}
                        label={t('edit')}
                        className="textPrimary"
                        onClick={handleEditClick(id)}
                        color="inherit"
                    />,
                    <GridActionsCellItem
                        key="delete"
                        icon={<DeleteIcon />}
                        label={t('delete')}
                        onClick={handleDeleteClick(id)}
                        color="inherit"
                    />,
                ];
            },
        },
    ];

    const initialState = {
        pagination: {
            paginationModel: {
                pageSize: 5,
            },
        },
    };

    return <>
        <Typography variant={"h6"} sx={{ mt: 4 }}>
            {props.exercise.getTranslation().name}
        </Typography>

        <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: cardio ? 12 : 6 }}>
                <FormQueryErrors mutationQuery={editLogQuery} />
                {rowError && <Typography color="error" role="alert">{rowError}</Typography>}

                <DataGrid
                    onProcessRowUpdateError={(error: Error) => setRowError(error instanceof RangeError ? error.message : null)}
                    initialState={initialState}
                    pageSizeOptions={PAGINATION_OPTIONS.pageSizeOptions}
                    disableRowSelectionOnClick
                    rows={rows}
                    columns={columns}
                    editMode="row"
                    rowModesModel={rowModesModel}
                    onRowModesModelChange={handleRowModesModelChange}
                    onRowEditStop={handleRowEditStop}
                    processRowUpdate={processRowUpdate}
                    // A time/distance primary is edited in the Time/Distance column and
                    // a speed in Max speed, never twice
                    isCellEditable={params => !(params.field === 'repetitions' && params.row.primaryIsMetric) && !(params.field === 'weight' && params.row.weightIsSpeed)}
                />

            </Grid>
            <Grid size={{ xs: 12, md: cardio ? 12 : 6 }}>
                <TimeSeriesChart data={props.chartEntries ?? logEntries} key={props.exercise.id} />
            </Grid>
        </Grid>
    </>;
};
const LB_IN_KG = 0.45359237;
const REP_UNIT_LABELS: Record<number, string> = {
    [REP_UNIT_REPETITIONS]: "reps",
    [REP_UNIT_TILL_FAILURE]: "reps",
    [REP_UNIT_SECONDS]: "s",
    [REP_UNIT_MINUTES]: "min",
    [REP_UNIT_MILES]: "mi",
    [REP_UNIT_KILOMETERS]: "km",
    [REP_UNIT_METERS]: "m",
};
const WEIGHT_UNIT_LABELS: Record<number, string> = {
    [WEIGHT_UNIT_KG]: "kg",
    [WEIGHT_UNIT_LB]: "lb",
    [WEIGHT_UNIT_KMH]: "km/h",
    [WEIGHT_UNIT_MPH]: "mph",
};
// Logs saved before units were stored count repetitions and kilograms, the server defaults
const repUnitOf = (log: WorkoutLog) => REP_UNIT_LABELS[log.repetitionUnitId ?? REP_UNIT_REPETITIONS] ?? log.repetitionUnitObj?.name ?? `unit ${log.repetitionUnitId}`;

// A load in kg; body weight, plates or a legacy speed are no load, so they are never charted as kg
const kgOf = (log: WorkoutLog) => {
    if (log.weight === null) return null;
    if (log.weightUnitId === WEIGHT_UNIT_LB) return log.weight * LB_IN_KG;
    return (log.weightUnitId ?? WEIGHT_UNIT_KG) === WEIGHT_UNIT_KG ? log.weight : null;
};

export type ChartMetric = "weight" | "reps";
export type ChartPoint = { id: number | string, value: number, time: number, entry: WorkoutLog };

/*
 * The chart's points, one series per set number (the Nth logged row of a session).
 *
 * A missing value is a gap, never 0; a stored 0 is plotted. Units never share an axis:
 * lb is converted to kg, other weight units are left out, and when the repetitions of
 * the range use several units only the newest session's unit is charted.
 */
export const progressionSeries = (data: WorkoutLog[], metric: ChartMetric) => {
    const withReps = data.filter(log => log.repetitions !== null);
    const newest = withReps.reduce<WorkoutLog | null>((latest, log) => latest === null || log.date >= latest.date ? log : latest, null);
    const repUnit = newest ? repUnitOf(newest) : "reps";
    const mixedUnits = metric === "reps" && withReps.some(log => repUnitOf(log) !== repUnit);

    const counters = new Map<string, number>();
    const series = new Map<number, ChartPoint[]>();
    // Every set of one workout shares that workout's date, so hovering one dot lists them all.
    const sets = new Map<number, [number, WorkoutLog][]>();
    data.forEach(log => {
        const session = sessionKey(log);
        const set = (counters.get(session) ?? 0) + 1;
        counters.set(session, set);
        const time = log.date.getTime();
        sets.set(time, [...(sets.get(time) ?? []), [set, log]]);
        const value = metric === "weight" ? kgOf(log) : repUnitOf(log) === repUnit ? log.repetitions : null;
        if (value !== null) {
            series.set(set, [...(series.get(set) ?? []), { id: log.id, value, time, entry: log }]);
        }
    });
    const ticks = [...new Set([...series.values()].flat().map(point => point.time))].sort((a, b) => a - b);
    return { series: [...series].sort((a, b) => a[0] - b[0]), sets, ticks, repUnit, mixedUnits };
};

const exerciseLogTooltip = (sets: Map<number, [number, WorkoutLog][]>) => ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const time = payload?.[0]?.payload?.time as number | undefined;
    if (!active || time === undefined) {
        return null;
    }
    return <Card>
        <CardContent>
            <Typography variant="body1">{DateTime.fromMillis(time).toFormat('dd/MM/yy')}</Typography>
            {(sets.get(time) ?? []).map(([set, log]) => <Typography variant="body2" key={log.id}>
                Set {set}: {log.repetitions ?? "—"} {repUnitOf(log)} × {log.weight === null ? "—" : `${log.weight} ${WEIGHT_UNIT_LABELS[log.weightUnitId ?? WEIGHT_UNIT_KG] ?? log.weightUnitObj?.name ?? ""}`.trim()}{log.rir ? `, ${log.rir} RiR` : ''}
            </Typography>)}
        </CardContent>
    </Card>;
};

export const TimeSeriesChart = (props: { data: WorkoutLog[] }) => {
    const [picked, setPicked] = React.useState<ChartMetric | null>(null);
    const range = loadProgressionChartRange();
    const rangeLabel = PROGRESSION_CHART_RANGES.find(option => option.value === range)!.label;
    const chartData = filterProgressionChartData(props.data, range);
    // Bodyweight moves (e.g. superman) log reps only, so reps are the default when no set carries a load.
    const metric = picked ?? (chartData.some(log => (kgOf(log) ?? 0) > 0) ? "weight" : "reps");
    const { series, sets, ticks, repUnit, mixedUnits } = progressionSeries(chartData, metric);
    const colorGenerator = generateChartColors(series.length);

    let empty = null;
    if (props.data.length === 0) {
        empty = "No recorded sets yet.";
    } else if (chartData.length === 0) {
        empty = `No sets in the chart range (${rangeLabel}). Change "Exercise chart range" in Preferences to see older workouts.`;
    } else if (ticks.length === 0) {
        empty = `No ${metric === "weight" ? "kg" : "reps"} recorded in the chart range (${rangeLabel}). Try ${metric === "weight" ? "Reps" : "kg"}.`;
    }

    return (
        <Box>
            <ToggleButtonGroup
                size="small"
                exclusive
                value={metric}
                onChange={(_, value: ChartMetric | null) => value && setPicked(value)}
                aria-label="Chart measure"
            >
                <ToggleButton value="weight">kg</ToggleButton>
                <ToggleButton value="reps">Reps</ToggleButton>
            </ToggleButtonGroup>
            {mixedUnits && <Typography variant="caption" color="text.secondary" component="p">
                Only sets counted in {repUnit} are shown; the others use a different unit.
            </Typography>}
            {empty !== null ? <Typography color="text.secondary" sx={{ py: 4 }}>{empty}</Typography> :
                <ScatterChart responsive width={"100%"} height={250}>
                    <XAxis
                        dataKey="time"
                        domain={["auto", "auto"]}
                        name="Time"
                        ticks={ticks}
                        interval={0}
                        padding={{ left: 16, right: 16 }}
                        tickFormatter={unixTime => DateTime.fromMillis(unixTime).toFormat('dd/MM/yy')}
                        type="number"
                    />
                    <YAxis
                        domain={["auto", "auto"]}
                        dataKey="value"
                        name="Value"
                        unit={metric === "weight" ? "kg" : ` ${repUnit}`}
                    />

                    {series.map(([set, points]) => {
                        const color = colorGenerator.next().value!;
                        return <Scatter
                            key={set}
                            data={points}
                            fill={color}
                            line={{ stroke: color }}
                            lineType="joint"
                            lineJointType="monotoneX"
                            name={`Set ${set}`}
                        />;
                    })}

                    <Tooltip content={exerciseLogTooltip(sets)} />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Legend />
                </ScatterChart>}
        </Box>
    );
};