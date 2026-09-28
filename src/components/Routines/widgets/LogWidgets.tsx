import CancelIcon from "@mui/icons-material/Cancel";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Box, Card, CardContent, Typography } from '@mui/material';
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
    GridRowsProp
} from "@mui/x-data-grid";
import { FormQueryErrors } from "@/core/ui/Widgets/FormError";
import { Exercise } from "@/components/Exercises";
import { RIR_VALUES_SELECT_LIST } from "@/components/Routines/models/BaseConfig";
import { WorkoutLog } from "@/components/Routines/models/WorkoutLog";
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
import { PAGINATION_OPTIONS } from "@/core/lib/consts";
import { dateToLocale } from "@/core/lib/date";
import { filterProgressionChartData } from "@/components/Routines/widgets/progressionChartRange";


export const ExerciseLog = (props: { exercise: Exercise, routineId: number | null, logEntries: WorkoutLog[] | undefined, chartEntries?: WorkoutLog[], displayDate?: Date, displayDates?: Map<string, Date> }) => {
    const { t } = useTranslation();
    const logEntries = props.logEntries ?? [];
    const deleteLogQuery = useDeleteRoutineLogQuery(props.routineId);
    const editLogQuery = useEditRoutineLogQuery(props.routineId);

    const initialRows: GridRowsProp = logEntries.map((logEntry: WorkoutLog) => ({
        id: logEntry.id,
        date: props.displayDates?.has(logEntry.id) ? new Date(props.displayDates.get(logEntry.id)!.getTime()) : props.displayDate ? new Date(props.displayDate.getTime()) : logEntry.date,
        repetitions: logEntry.repetitions,
        weight: logEntry.weight,
        rir: logEntry.rir,
        entry: logEntry
    }));


    const [rows, setRows] = React.useState(initialRows);
    const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});

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

    const processRowUpdate = (newRow: GridRowModel, oldRow: GridRowModel) => {

        const log = newRow.entry;
        if (log !== undefined) {
            if (newRow.date.getTime() !== oldRow.date.getTime()) log.date = newRow.date;
            log.repetitions = newRow.repetitions;
            log.weight = newRow.weight;
            log.rir = newRow.rir;

            editLogQuery.mutate(log);
        }

        const updatedRow = { ...newRow, isNew: false };
        setRows(rows.map((row) => (row.id === newRow.id ? updatedRow : row)));
        return updatedRow;
    };

    const handleRowModesModelChange = (newRowModesModel: GridRowModesModel) => {
        setRowModesModel(newRowModesModel);
    };

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
            <Grid size={{ xs: 12, md: 6 }}>
                <FormQueryErrors mutationQuery={editLogQuery} />

                <DataGrid
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
                />

            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
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