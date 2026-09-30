import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, Button, Chip, Divider, List, ListItem, ListItemButton, ListItemText, Paper, } from "@mui/material";
import { LoadingPlaceholder } from "@/core/ui/LoadingWidget/LoadingWidget";
import { WgerContainerRightSidebar } from "@/core/ui/Widgets/Container";
import { OverviewEmpty } from "@/core/ui/Widgets/OverviewEmpty";
import { Routine } from "@/components/Routines/models/Routine";
import { AddRoutineFab } from "@/components/Routines/screens/Overview/Fab";
import { useRoutinesShallowQuery } from "@/components/Routines/queries";
import { RoutineImportDialog } from "@/components/Routines/widgets/RoutineImportDialog";
import { JustTrashed, RoutineTrash } from "@/components/Routines/widgets/RoutineTrash";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { dateToLocale } from "@/core/lib/date";
import { makeLink, WgerLink } from "@/core/lib/url";

export const RoutineList = (props: {
    routine: Routine,
    linkDestination?: WgerLink,
    showTemplateChip?: boolean,
    showTemplateVisibility?: boolean
}) => {
    const [t, i18n] = useTranslation();

    const showTemplateChip = props.showTemplateChip ?? true;
    const showTemplateVisibility = props.showTemplateVisibility ?? false;

    const destination = props.linkDestination ?? WgerLink.ROUTINE_DETAIL;
    const detailUrl = makeLink(destination, i18n.language, { id: props.routine.id! });

    const primaryText = props.routine.name !== '' ? props.routine.name : t('routines.routine');

    const chipTemplate = props.routine.isTemplate && showTemplateChip
        ? <Chip color="info" size="small" label={t('routines.template')} />
        : null;

    const chipVisibility = props.routine.isTemplate && showTemplateVisibility
        ? <Chip color="info" size="small"
                label={t(props.routine.isPublic ? 'public' : 'private')} />
        : null;


    return <>
        <ListItem sx={{ p: 0 }}>
            <ListItemButton component="a" href={detailUrl}>
                <ListItemText
                    primary={<>{primaryText} {chipTemplate} {chipVisibility}</>}
                    secondary={`${props.routine.durationText} (${dateToLocale(props.routine.start)} - ${dateToLocale(props.routine.end)})`}
                />
                <ChevronRightIcon />
            </ListItemButton>
        </ListItem>
        <Divider component="li" />
    </>;
};

export const RoutineOverview = () => {
    const routineQuery = useRoutinesShallowQuery();
    const [t] = useTranslation();
    const [importOpen, setImportOpen] = useState(false);
    const justTrashed = (useLocation().state as { trashed?: JustTrashed } | null)?.trashed;

    if (routineQuery.isLoading) {
        return <LoadingPlaceholder />;
    }


    return <WgerContainerRightSidebar
        title={t("routines.routines")}
        mainContent={<>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}>
                <Button size="small" href="#trash">Trash</Button>
                <Button variant="outlined" size="small" onClick={() => setImportOpen(true)}>
                    {t("routines.spreadsheet.import")}
                </Button>
            </Box>
            {routineQuery.data!.length === 0
                ? <OverviewEmpty />
                : <Paper>
                    <List sx={{ py: 0 }} key={'abc'}>
                        {routineQuery.data!.map(r => <RoutineList routine={r} key={r.id} />)}
                    </List>
                </Paper>}
            <RoutineTrash justTrashed={justTrashed} />
            <RoutineImportDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
                routines={routineQuery.data ?? []}
            />
        </>}
        fab={<AddRoutineFab />}
    />;
};
