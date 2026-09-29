import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import {
    downloadRoutineSpreadsheet,
    ImportExerciseMatch,
    ImportMode,
    ImportPreview,
    ImportRequest,
    previewRoutineImport,
} from "@/components/Routines/api/routine";
import { Routine } from "@/components/Routines/models/Routine";
import { useConfirmRoutineImportQuery } from "@/components/Routines/queries/routines";
import { makeLink, WgerLink } from "@/core/lib/url";
import axios from "axios";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";

const matchText = (t: TFunction, match: ImportExerciseMatch | null) => {
    if (match === null) {
        return '';
    }
    switch (match.how) {
        case 'id':
        case 'uuid':
        case 'name':
            return t(`routines.spreadsheet.matchedBy_${match.how}`, { name: match.name, id: match.id });
        case 'mismatch':
            return t('routines.spreadsheet.matchMismatch', { id: match.id });
        case 'ambiguous':
            return t('routines.spreadsheet.matchAmbiguous', {
                candidates: match.candidates.map(c => `${c.name} (#${c.id})`).join(', ')
            });
        case 'unresolved':
            return t('routines.spreadsheet.matchUnresolved');
    }
};

// The body of a rejected request, when it's a preview (400/409 of import-confirm)
const previewOfError = (error: unknown): ImportPreview | null => {
    const data = axios.isAxiosError(error) ? error.response?.data : null;
    return data && typeof data === 'object' && Array.isArray(data.rows) ? data as ImportPreview : null;
};

// Nothing was written. The message of a rejected preview or confirm
const errorMessage = (error: unknown, t: TFunction, fallback: string) => {
    if (!axios.isAxiosError(error)) {
        return fallback;
    }
    if (error.response?.status === 404) {
        return t('routines.spreadsheet.notOwned');
    }
    const data = error.response?.data;
    if (!data || typeof data !== 'object') {
        return fallback;
    }
    if (typeof data.detail === 'string') {
        return data.detail;
    }
    // A plan with errors: they are listed in the preview
    if (Array.isArray(data.rows)) {
        return fallback;
    }
    // Field errors, e.g. {"file": ["Must be csv or xlsx."]}
    const message = Object.values(data).flat().find(v => typeof v === 'string');
    return typeof message === 'string' ? message : fallback;
};

const PreviewDetails = ({ preview }: { preview: ImportPreview }) => {
    const [t] = useTranslation();
    const errorsByRow = new Map<number, string[]>();
    const generalErrors: string[] = [];
    for (const e of preview.errors) {
        const message = e.column ? `${e.column}: ${e.message}` : e.message;
        if (e.row === null) {
            generalErrors.push(message);
        } else {
            errorsByRow.set(e.row, [...(errorsByRow.get(e.row) ?? []), message]);
        }
    }
    // Errors of a row the plan didn't list (e.g. a CSV parse error) still show up in the table
    const rows = [...preview.rows];
    for (const row of errorsByRow.keys()) {
        if (!rows.some(r => r.row === row)) {
            rows.push({ row, status: 'error', exercise: null });
        }
    }
    rows.sort((a, b) => a.row - b.row);
    const { create, update, delete: remove } = preview.diff;

    return <Stack spacing={1} sx={{ mt: 2 }} data-testid="import-preview">
        {preview.ok
            ? <Alert severity="success">{t('routines.spreadsheet.previewOk')}</Alert>
            : <Alert severity="error">{t('routines.spreadsheet.previewBlocked')}</Alert>}
        {[...new Set(generalErrors)].map(message => <Alert severity="error" key={message}>{message}</Alert>)}

        {preview.routine && <Typography variant="body2">
            {t('routines.spreadsheet.routineSummary', {
                name: preview.routine.name,
                start: preview.routine.start,
                end: preview.routine.end
            })}
        </Typography>}
        <Typography variant="body2">
            {t('routines.spreadsheet.diffSummary', {
                createDays: create.days, createSlots: create.slots, createEntries: create.entries,
                updateDays: update.days, updateSlots: update.slots, updateEntries: update.entries,
                deleteDays: remove.days, deleteSlots: remove.slots, deleteEntries: remove.entries,
            })}
        </Typography>

        {preview.diff.blocked_deletes.length > 0 && <Alert severity="error">
            {t('routines.spreadsheet.blockedDeletes')}
            <ul>
                {preview.diff.blocked_deletes.map(b => <li key={`${b.kind}-${b.id}`}>
                    {`${b.kind} #${b.id}: ${b.reason}`}
                </li>)}
            </ul>
        </Alert>}

        {preview.unsupported_dropped.length > 0 && <Alert severity="warning">
            {t('routines.spreadsheet.unsupportedDropped')}
            <ul>
                {preview.unsupported_dropped.map(d => <li key={d.row}>
                    {t('routines.spreadsheet.rowNumber', { row: d.row })}: {d.codes.join(', ')}
                </li>)}
            </ul>
        </Alert>}

        <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('routines.spreadsheet.row')}</TableCell>
                        <TableCell>{t('routines.spreadsheet.status')}</TableCell>
                        <TableCell>{t('routines.spreadsheet.exercise')}</TableCell>
                        <TableCell>{t('routines.spreadsheet.problems')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map(r => {
                        const problems = errorsByRow.get(r.row) ?? [];
                        return <TableRow key={r.row}>
                            <TableCell>{r.row}</TableCell>
                            <TableCell>
                                {problems.length > 0 || r.status === 'error'
                                    ? t('routines.spreadsheet.statusError')
                                    : t('routines.spreadsheet.statusOk')}
                            </TableCell>
                            <TableCell sx={{ wordBreak: 'break-word' }}>{matchText(t, r.exercise)}</TableCell>
                            <TableCell sx={{ wordBreak: 'break-word' }}>{problems.join('; ')}</TableCell>
                        </TableRow>;
                    })}
                </TableBody>
            </Table>
        </Box>
    </Stack>;
};

/*
 * Upload a CSV/XLSX routine, preview what it would change, and only then apply it
 *
 * Confirm is only possible for a successful preview of exactly the current
 * file and options, any change throws the preview away.
 */
export const RoutineImportDialog = (props: { open: boolean, onClose: () => void, routines: Routine[] }) => {
    const [t, i18n] = useTranslation();
    const confirmQuery = useConfirmRoutineImportQuery();

    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<ImportMode>('create');
    const [routineId, setRoutineId] = useState<number | null>(null);
    const [dropUnsupported, setDropUnsupported] = useState(false);

    // The preview and the request it belongs to
    const [preview, setPreview] = useState<{ request: ImportRequest, data: ImportPreview } | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdId, setCreatedId] = useState<number | null>(null);
    // Bumped on every change, so a preview answering an older request is ignored
    const version = useRef(0);

    const updatable = props.routines.filter(r => r.isNotTemplate);
    const request: ImportRequest | null = file && (mode === 'create' || routineId !== null)
        ? {
            file,
            mode,
            routineId: mode === 'update' ? routineId : null,
            dropUnsupported: mode === 'create' && dropUnsupported
        }
        : null;

    const invalidate = () => {
        version.current++;
        setPreview(null);
        setError(null);
        setCreatedId(null);
        setIsPreviewing(false);
    };

    const handlePreview = async () => {
        if (request === null) {
            return;
        }
        invalidate();
        const current = version.current;
        setIsPreviewing(true);
        try {
            const data = await previewRoutineImport(request);
            if (current === version.current) {
                setPreview({ request, data });
            }
        } catch (e) {
            if (current === version.current) {
                setError(errorMessage(e, t, t('routines.spreadsheet.previewFailed')));
            }
        } finally {
            if (current === version.current) {
                setIsPreviewing(false);
            }
        }
    };

    const handleConfirm = async () => {
        if (preview === null || !preview.data.ok) {
            return;
        }
        try {
            const result = await confirmQuery.mutateAsync({ request: preview.request, planHash: preview.data.plan_hash });
            // The server applied it, whatever happened in the form meanwhile
            invalidate();
            setCreatedId(result.id);
        } catch (e) {
            // Nothing was written. Show what the server found, but only a new
            // preview can enable confirm again
            const body = previewOfError(e);
            setPreview(body ? { request: preview.request, data: { ...body, ok: false } } : null);
            setError(errorMessage(e, t, t('routines.spreadsheet.confirmFailed')));
        }
    };

    const handleClose = () => {
        invalidate();
        setFile(null);
        setDropUnsupported(false);
        props.onClose();
    };

    // The server only rejects unsupported rows when creating
    const hasUnsupportedErrors = preview?.data.errors.some(e => e.column === 'unsupported') ?? false;
    const showDrop = mode === 'create' && (dropUnsupported || hasUnsupportedErrors);
    // Every change clears the preview; comparing the request as well keeps a
    // stale one from ever enabling confirm
    const previewed = preview?.request;
    const canConfirm = preview !== null && preview.data.ok && !confirmQuery.isPending
        && request !== null && previewed !== undefined
        && previewed.file === request.file && previewed.mode === request.mode
        && previewed.routineId === request.routineId && previewed.dropUnsupported === request.dropUnsupported;

    return <Dialog open={props.open} onClose={handleClose} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle>{t('routines.spreadsheet.importTitle')}</DialogTitle>
        <DialogContent dividers>
            <Stack spacing={2}>
                <Alert severity="info">{t('routines.spreadsheet.planningOnly')}</Alert>

                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
                    <Typography variant="body2">{t('routines.spreadsheet.template')}</Typography>
                    <Button size="small" onClick={() => downloadRoutineSpreadsheet('csv').catch(
                        () => setError(t('routines.spreadsheet.downloadFailed'))
                    )}>CSV</Button>
                    <Button size="small" onClick={() => downloadRoutineSpreadsheet('xlsx').catch(
                        () => setError(t('routines.spreadsheet.downloadFailed'))
                    )}>XLSX</Button>
                </Stack>

                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={mode}
                    onChange={(_, value: ImportMode | null) => {
                        if (value !== null) {
                            setMode(value);
                            invalidate();
                        }
                    }}
                >
                    <ToggleButton value="create">{t('routines.spreadsheet.modeCreate')}</ToggleButton>
                    <ToggleButton value="update">{t('routines.spreadsheet.modeUpdate')}</ToggleButton>
                </ToggleButtonGroup>

                {mode === 'update' && <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('routines.spreadsheet.targetRoutine')}
                    value={routineId ?? ''}
                    onChange={e => {
                        setRoutineId(e.target.value === '' ? null : Number(e.target.value));
                        invalidate();
                    }}
                >
                    {updatable.map(r => <MenuItem key={r.id} value={r.id!}>{r.name}</MenuItem>)}
                </TextField>}

                <Box>
                    <Button variant="outlined" component="label">
                        {t('routines.spreadsheet.chooseFile')}
                        <input
                            hidden
                            type="file"
                            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            data-testid="import-file"
                            onChange={e => {
                                setFile(e.target.files?.[0] ?? null);
                                // Picking the same file again after editing it must still fire
                                e.target.value = '';
                                invalidate();
                            }}
                        />
                    </Button>
                    {file && <Typography variant="body2" component="span" sx={{ ml: 1, wordBreak: 'break-all' }}>
                        {file.name}
                    </Typography>}
                </Box>

                {showDrop && <FormControlLabel
                    control={<Checkbox
                        checked={dropUnsupported}
                        onChange={e => {
                            setDropUnsupported(e.target.checked);
                            invalidate();
                        }}
                    />}
                    label={t('routines.spreadsheet.dropUnsupported')}
                />}
            </Stack>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {createdId !== null && <Alert
                severity="success"
                sx={{ mt: 2 }}
                action={<Button
                    color="inherit"
                    size="small"
                    href={makeLink(WgerLink.ROUTINE_DETAIL, i18n.language, { id: createdId })}
                >
                    {t('routines.spreadsheet.openRoutine')}
                </Button>}
            >
                {t('routines.spreadsheet.importDone')}
            </Alert>}
            {preview && <PreviewDetails preview={preview.data} />}
        </DialogContent>
        <DialogActions>
            <Button onClick={handleClose}>{t('close')}</Button>
            <Button onClick={handlePreview} disabled={request === null || isPreviewing || confirmQuery.isPending}>
                {t('routines.spreadsheet.preview')}
            </Button>
            <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
                {t('routines.spreadsheet.confirm')}
            </Button>
        </DialogActions>
    </Dialog>;
};
