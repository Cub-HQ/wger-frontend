import { getRoutinePreview, ROUTINE_PREVIEW_PATH } from "@/components/Routines/api/routinePreview";
import { getDayName } from "@/components/Routines/models/Day";
import { RoutineDayData } from "@/components/Routines/models/RoutineDayData";
import { dateToLocale, daysBetween } from "@/core/lib/date";
import { LoadingPlaceholder } from "@/core/ui/LoadingWidget/LoadingWidget";
import { WgerContainerFullWidth } from "@/core/ui/Widgets/Container";
import { Alert, AlertTitle, Box, Card, CardContent, CardHeader, Chip, Divider, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import React from "react";
import { useParams } from "react-router-dom";

type PreviewWeek = { number: number, days: RoutineDayData[], labels: string[] };

/*
 * Calendar weeks counted from the first scheduled date. The dates and labels
 * come from the server's resolved sequence; nothing is derived beyond grouping.
 */
export const groupPreviewWeeks = (schedule: RoutineDayData[]): PreviewWeek[] => {
    const weeks: PreviewWeek[] = [];
    if (schedule.length === 0) {
        return weeks;
    }
    const start = schedule[0].date;
    for (const dayData of schedule) {
        const number = Math.floor(daysBetween(start, dayData.date) / 7) + 1;
        let week = weeks.at(-1);
        if (week?.number !== number) {
            week = { number, days: [], labels: [] };
            weeks.push(week);
        }
        week.days.push(dayData);
        if (dayData.label && !week.labels.includes(dayData.label)) {
            week.labels.push(dayData.label);
        }
    }
    return weeks;
};

const errorMessage = (status: number | undefined): { title: string, body: string } => {
    switch (status) {
        case 401:
        case 403:
            return { title: 'Please log in', body: 'Log in to the gym with the account this proposal belongs to, then reopen this link.' };
        case 404:
            return { title: 'Preview not found', body: 'This preview does not exist or is not available to your account.' };
        case 410:
            return { title: 'Preview expired', body: 'This preview has expired. Ask for a new preview link.' };
        default:
            return { title: 'Could not load preview', body: 'Something went wrong while loading this preview. Try again later.' };
    }
};

const PreviewDay = ({ dayData, showLabel, exerciseNames }: {
    dayData: RoutineDayData,
    showLabel: boolean,
    exerciseNames: Record<string, string>,
}) => {
    const date = dateToLocale(dayData.date, undefined, { weekday: 'short' });
    const isRest = dayData.day === null || dayData.day.isRest;

    return <Card variant="outlined" component="article" aria-label={date}>
        <CardHeader
            sx={{ py: 1 }}
            disableTypography
            title={<Typography variant="subtitle1" component="h4">{date} · {getDayName(dayData.day)}</Typography>}
            subheader={<>
                {showLabel && dayData.label && <Chip size="small" color="secondary" label={dayData.label} sx={{ my: 0.5 }} />}
                {dayData.day?.description &&
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{dayData.day.description}</Typography>}
            </>}
        />
        {!isRest && dayData.slots.length > 0 && <CardContent sx={{ pt: 0 }}>
            <Stack divider={<Divider />} spacing={1}>
                {dayData.slots.map((slot, index) =>
                    // Slots have no id in the sequence and are never reordered here
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    <Box key={index}>
                        {slot.isSuperset && <Chip size="small" variant="outlined" label="Superset" sx={{ mb: 0.5 }} />}
                        {slot.comment && <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{slot.comment}</Typography>}
                        {slot.setConfigs.map((config, configIndex) =>
                            // eslint-disable-next-line @eslint-react/no-array-index-key
                            <Box key={configIndex} sx={{ mb: 0.5 }}>
                                {(configIndex === 0 || config.exerciseId !== slot.setConfigs[configIndex - 1].exerciseId) &&
                                    <Typography variant="h6">{exerciseNames[config.exerciseId] || `Exercise #${config.exerciseId}`}</Typography>}
                                <div>
                                    {config.textRepr}
                                    {config.isSpecialType &&
                                        <Chip label={config.type} color="info" size="small" sx={{ ml: 1 }} />}
                                </div>
                                {config.comment && <Typography variant="caption">{config.comment}</Typography>}
                            </Box>
                        )}
                    </Box>
                )}
            </Stack>
        </CardContent>}
    </Card>;
};

/*
 * Owner-private, read-only view of a program proposal before it is approved.
 * It deliberately offers no edit, log, publish or delete action and no link
 * to a saved routine: the proposal is not a routine yet.
 */
export const RoutinePreview = () => {
    const { previewId } = useParams<{ previewId: string }>();
    const query = useQuery({
        queryKey: [ROUTINE_PREVIEW_PATH, previewId],
        queryFn: () => getRoutinePreview(previewId!),
        enabled: previewId !== undefined,
        // Expiry and access are server-owned; recheck while the page stays open
        refetchInterval: 60_000,
    });

    if (query.isLoading) {
        return <LoadingPlaceholder />;
    }

    // An expired preview shows no program data, even if the page stayed open
    const expired = query.data !== undefined && query.data.expiresAt.getTime() <= Date.now();
    if (query.isError || expired || query.data === undefined) {
        const message = errorMessage(expired
            ? 410
            : axios.isAxiosError(query.error) ? query.error.response?.status : undefined);
        return <WgerContainerFullWidth title="Program preview">
            <Alert severity={expired ? 'warning' : 'error'} role="alert">
                <AlertTitle>{message.title}</AlertTitle>
                {message.body}
            </Alert>
        </WgerContainerFullWidth>;
    }

    const preview = query.data;
    const weeks = groupPreviewWeeks(preview.schedule);

    return <WgerContainerFullWidth title={preview.name || 'Program preview'}>
        <Stack spacing={2}>
            <Alert severity="info">
                <AlertTitle>Proposal awaiting approval</AlertTitle>
                This is a read-only preview of a proposed program. It is not a saved routine yet: nothing can
                be logged, edited or published from here.
                <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
                    Version <Box component="code" sx={{ fontFamily: 'monospace' }}>{preview.planHash}</Box>
                    {preview.externalVersion && <> ({preview.externalVersion})</>}
                    {' · '}available until {preview.expiresAt.toLocaleString()}
                </Typography>
            </Alert>
            {preview.description &&
                <Typography sx={{ whiteSpace: 'pre-line' }}>{preview.description}</Typography>}

            {weeks.map(week =>
                <Box component="section" key={week.number} aria-labelledby={`preview-week-${week.number}`}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                        <Typography variant="h5" component="h3" id={`preview-week-${week.number}`}>
                            Week {week.number}
                        </Typography>
                        {week.labels.map(label => <Chip key={label} color="secondary" label={label} />)}
                    </Stack>
                    <Box sx={{
                        display: 'grid',
                        gap: 1,
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fill, minmax(280px, 1fr))' },
                    }}>
                        {week.days.map(dayData =>
                            <PreviewDay
                                key={dayData.date.toISOString()}
                                dayData={dayData}
                                // One label for the whole week is already in the heading
                                showLabel={week.labels.length > 1}
                                exerciseNames={preview.exerciseNames}
                            />
                        )}
                    </Box>
                </Box>
            )}
        </Stack>
    </WgerContainerFullWidth>;
};
