import MenuIcon from '@mui/icons-material/Menu';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    Menu,
    MenuItem,
    Snackbar
} from "@mui/material";
import { downloadRoutineSpreadsheet } from "@/components/Routines/api/routine";
import { Routine } from "@/components/Routines/models/Routine";
import { getRoutineRevision, recoveryFailure } from "@/components/Routines/api/routineRecovery";
import { useTrashRoutineQuery } from "@/components/Routines/queries/routineRecovery";
import { RoutineTemplateForm } from "@/components/Routines/widgets/forms/RoutineTemplateForm";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { makeLink, WgerLink } from "@/core/lib/url";
import { randomUUID } from "@/core/lib/uuid";


export enum DialogToOpen {
    NONE,
    DELETE_CONFIRMATION,
    EDIT_TEMPLATE
}

export const RoutineDetailDropdown = (props: { routine: Routine }) => {

    const navigate = useNavigate();
    const trashQuery = useTrashRoutineQuery(props.routine.id!);

    const [t, i18n] = useTranslation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [deleteConfirmationOpen, setConfirmationOpen] = useState<DialogToOpen>(DialogToOpen.NONE);
    const [downloadFailed, setDownloadFailed] = useState(false);
    const [trashError, setTrashError] = useState('');
    // Kept for a retry after a network failure, so the server can't trash twice
    const trashAttempt = useRef<{ revision: string, key: string } | null>(null);
    const inFlight = useRef(false);

    // A trashed routine is read-only until restored: the server refuses writes with 409 routine_trashed
    const trashed = props.routine.deletedAt !== null;
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleDelete = () => {
        trashAttempt.current = null;
        setTrashError('');
        setConfirmationOpen(DialogToOpen.DELETE_CONFIRMATION);
        handleClose(); // Close the dropdown menu
    };

    const handleTemplate = () => {
        setConfirmationOpen(DialogToOpen.EDIT_TEMPLATE);
        handleClose();
    };

    const handleConfirmDelete = async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setTrashError('');
        try {
            // Fresh revision: a plan changed elsewhere since this page loaded is refused (409)
            trashAttempt.current ??= { revision: await getRoutineRevision(props.routine.id!), key: randomUUID() };
            const receipt = await trashQuery.mutateAsync(trashAttempt.current);
            navigate(makeLink(WgerLink.ROUTINE_OVERVIEW, i18n.language), { state: { trashed: { ...receipt, name: props.routine.name } } });
        } catch (e) {
            const failure = recoveryFailure(e);
            if (failure.kind !== 'retry') trashAttempt.current = null;
            setTrashError({
                conflict: failure.code === 'routine_trashed'
                    ? 'This routine is already in Trash.'
                    : 'This routine changed while this was open. Nothing was moved. Try again.',
                expired: 'This routine is no longer available.',
                notFound: 'You can only move your own routines to Trash.',
                invalid: failure.detail ?? 'The server refused this. Nothing was moved.',
                retry: 'Could not reach the server. Try again; retrying never trashes twice.',
            }[failure.kind]);
        } finally {
            inFlight.current = false;
        }
    };

    const handleCloseDialogs = () => {
        if (inFlight.current) return;
        setConfirmationOpen(DialogToOpen.NONE);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    /*
     *  Note: this is a workaround. Instead of just using the navigate function we need to
     *        force a reload of the page, otherwise the drag-and-drop doesn't work properly
     *        when loaded from within the django application. This has probably to do with
     *        the way we add the components there. If we find a solution for that one day,
     *        this can be removed.
     *
     *        See also: https://github.com/wger-project/wger/issues/1943
     */
    const navigateEdit = () => window.location.href = makeLink(
        WgerLink.ROUTINE_EDIT,
        i18n.language,
        { id: props.routine.id! }
    );


    return (
        <div>
            <Button onClick={handleClick}>
                <MenuIcon />
            </Button>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
            >
                {!trashed && <MenuItem
                    // disabled={props.routine.isTemplate}
                    onClick={navigateEdit}>
                    {t("edit")}
                </MenuItem>}
                <MenuItem
                    component={Link}
                    to={makeLink(WgerLink.ROUTINE_DETAIL_TABLE, i18n.language, { id: props.routine.id! })}>
                    Table view
                </MenuItem>
                {props.routine.isNotTemplate && <MenuItem
                    component={Link}
                    to={makeLink(WgerLink.ROUTINE_LOGS_OVERVIEW, i18n.language, { id: props.routine.id! })}>
                    {t("routines.logsOverview")}
                </MenuItem>}
                {props.routine.isNotTemplate && <MenuItem
                    component={Link}
                    to={makeLink(WgerLink.ROUTINE_STATS_OVERVIEW, i18n.language, { id: props.routine.id! })}>
                    {t("routines.statsOverview")}
                </MenuItem>}
                <MenuItem
                    component="a"
                    href={makeLink(WgerLink.ROUTINE_COPY, i18n.language, { id: props.routine.id! })}
                >
                    {t("routines.duplicate")}
                </MenuItem>
                {!trashed && <MenuItem onClick={handleTemplate}>
                    {t("routines.markAsTemplate")}
                </MenuItem>}
                <MenuItem
                    component="a"
                    href={makeLink(WgerLink.ROUTINE_PDF_TABLE, i18n.language, { id: props.routine.id! })}
                    download={`Routine-${props.routine.id}-table.pdf`}>
                    {t("routines.downloadPdfTable")}
                </MenuItem>
                <MenuItem
                    component="a"
                    href={makeLink(WgerLink.ROUTINE_PDF_LOGS, i18n.language, { id: props.routine.id! })}
                    download={`Routine-${props.routine.id}-logs.pdf`}>
                    {t("routines.downloadPdfLogs")}
                </MenuItem>
                {!trashed && <MenuItem
                    component="a"
                    href={makeLink(WgerLink.ROUTINE_ICAL, i18n.language, { id: props.routine.id! })}
                    download={`Routine-${props.routine.id}-calendar.ics`}>
                    {t("routines.downloadIcal")}
                </MenuItem>}
                <MenuItem onClick={() => {
                    handleClose();
                    downloadRoutineSpreadsheet('csv', props.routine.id!).catch(() => setDownloadFailed(true));
                }}>
                    {t("routines.spreadsheet.downloadCsv")}
                </MenuItem>
                <MenuItem onClick={() => {
                    handleClose();
                    downloadRoutineSpreadsheet('xlsx', props.routine.id!).catch(() => setDownloadFailed(true));
                }}>
                    {t("routines.spreadsheet.downloadXlsx")}
                </MenuItem>
                <Divider />
                <MenuItem component="a" href={`${makeLink(WgerLink.ROUTINE_OVERVIEW, i18n.language)}#trash`}>
                    Previous versions and Trash
                </MenuItem>
                {!trashed && <MenuItem onClick={handleDelete}>Move to Trash</MenuItem>}
            </Menu>

            <Snackbar open={downloadFailed} onClose={() => setDownloadFailed(false)}>
                <Alert severity="error" onClose={() => setDownloadFailed(false)}>
                    {t("routines.spreadsheet.downloadFailed")}
                </Alert>
            </Snackbar>

            <Dialog
                open={deleteConfirmationOpen === DialogToOpen.DELETE_CONFIRMATION}
                onClose={handleCloseDialogs}
                aria-labelledby="alert-dialog-title"
            >
                <DialogTitle id="alert-dialog-title">
                    Move to Trash?
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        {props.routine.name || t('routines.routine')} leaves your active routines and calendar.
                        You can undo or restore it from Trash for 14 days. Logged workouts stay in your history.
                    </DialogContentText>
                    {trashError && <Alert severity="error" sx={{ mt: 2 }}>{trashError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialogs} disabled={trashQuery.isPending}>
                        {t("cancel")}
                    </Button>
                    <Button onClick={handleConfirmDelete} color="error" autoFocus disabled={trashQuery.isPending}>
                        {trashQuery.isPending ? 'Moving…' : trashError && trashAttempt.current ? 'Try again' : 'Move to Trash'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={deleteConfirmationOpen === DialogToOpen.EDIT_TEMPLATE}
                onClose={handleCloseDialogs}
            >
                <DialogTitle>
                    {t("routines.markAsTemplate")}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        <RoutineTemplateForm routine={props.routine} />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialogs}>
                        {t("close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};
