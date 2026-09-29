import CancelIcon from "@mui/icons-material/Cancel";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Box, Card, CardContent, InputAdornment, Typography } from '@mui/material';
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
import { PAGINATION_OPTIONS, REP_UNIT_KILOMETERS, WEIGHT_UNIT_KMH } from "@/core/lib/consts";
import { dateToLocale } from "@/core/lib/date";
import { filterProgressionChartData } from "@/components/Routines/widgets/progressionChartRange";

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
/*
 * Format the log entries so that they can be passed to the chart
 *
 * This is mostly due to the time, which needs to be a number to be shown
 * in the scatter plot
 */
const formatData = (data: WorkoutLog[], byReps = false) =>
    data.map((log) => {
        return {
            id: log.id,
            value: byReps ? log.repetitions : log.weight,
            time: log.date.getTime(),
            entry: log,
        };
    });

const exerciseLogTooltip = (sets: Map<number, [number, WorkoutLog][]>) => ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const time = payload?.[0]?.payload?.time as number | undefined;
    if (!active || time === undefined) {
        return null;
    }
    return <Card>
        <CardContent>
            <Typography variant="body1">{DateTime.fromMillis(time).toFormat('dd/MM/yy')}</Typography>
            {(sets.get(time) ?? []).map(([set, log]) => <Typography variant="body2" key={log.id}>
                Set {set}: {log.weight ? `${log.repetitions} × ${log.weight}kg` : `${log.repetitions} reps`}{log.rir ? `, ${log.rir} RiR` : ''}
            </Typography>)}
        </CardContent>
    </Card>;
};

export const TimeSeriesChart = (props: { data: WorkoutLog[] }) => {

    const chartData = filterProgressionChartData(props.data);

    // A set keeps the same colour across workout dates so its progression is visible.
    const counters = new Map<string, number>();
    const result = new Map<number, WorkoutLog[]>();
    chartData.forEach(log => {
        const session = log.sessionId ?? log.date.toDateString();
        const setNumber = (counters.get(session) ?? 0) + 1;
        counters.set(session, setNumber);
        result.set(setNumber, [...(result.get(setNumber) ?? []), log]);
    });
    // Every set of one workout shares that workout's date, so hovering one dot lists them all.
    const sets = new Map<number, [number, WorkoutLog][]>();
    result.forEach((logs, set) => logs.forEach(log => sets.set(log.date.getTime(), [...(sets.get(log.date.getTime()) ?? []), [set, log]])));
    const ticks = [...sets.keys()].sort((a, b) => a - b);
    // Bodyweight moves (e.g. superman) log reps only, so chart reps when no set carries weight.
    const byReps = !chartData.some(log => log.weight !== null && log.weight !== 0);

    const colorGenerator = generateChartColors(result.size);

    return (
        <Box>
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
                    unit={byReps ? " reps" : "kg"}
                />

                {Array.from(result).map(([key, value]) => {
                        const color = colorGenerator.next().value!;
                        const formattedData = formatData(value, byReps);

                        return <Scatter
                            key={key}
                            data={formattedData}
                            fill={color}
                            line={{ stroke: color }}
                            lineType="joint"
                            lineJointType="monotoneX"
                            name={`Set ${key}`}
                        />;
                    }
                )}

                <Tooltip content={exerciseLogTooltip(sets)} />
                <CartesianGrid strokeDasharray="3 3" />
                <Legend />
            </ScatterChart>
        </Box>
    );
};