import type { EnduranceEntry } from "@/components/Calendar/api/endurance";
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Button, Chip, ListItem, Stack, Typography } from '@mui/material';
import React from 'react';

const NONE = '—';

export const formatDuration = (seconds: number | null) => {
    if (seconds === null) {
        return NONE;
    }
    const minutes = Math.round(seconds / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? `${m} min` : `${h} h ${m} min`;
};

/*
 * One Intervals.icu row of the day. Read-only: it has no sets, no edit and no
 * delete here, only a way to open it in Intervals.
 */
export const EnduranceItem = ({ entry }: { entry: EnduranceEntry }) => {
    const planned = entry.kind === 'planned';
    // Moving time is what Intervals shows first; elapsed only when that is all there is
    const duration = entry.movingTimeS !== null || entry.elapsedTimeS === null
        ? `${planned ? 'Planned' : 'Moving'} ${formatDuration(entry.movingTimeS ?? (planned ? entry.timeTargetS : null))}`
        : `Elapsed ${formatDuration(entry.elapsedTimeS)}`;
    // A planned event without its own load still has the target set in Intervals
    const loadFact = entry.trainingLoad === null && planned && entry.loadTarget !== null
        ? `Load target (Intervals) ${entry.loadTarget}`
        : `Load (Intervals) ${entry.trainingLoad ?? NONE}`;
    const facts = [
        duration,
        loadFact,
        entry.distanceM !== null && `${(entry.distanceM / 1000).toFixed(1)} km`,
        entry.avgHr !== null && `Avg HR ${entry.avgHr} bpm`,
        entry.maxHr !== null && `Max HR ${entry.maxHr} bpm`,
        // Intervals' own scale, shown as it comes
        entry.intensity !== null && `Intensity (Intervals) ${entry.intensity}`,
    ].filter(Boolean);

    return (
        <ListItem sx={{ display: 'block', pl: 4 }} data-testid={`endurance-${entry.id}`}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip
                    size="small"
                    label={planned ? 'Planned' : 'Completed'}
                    color={planned ? 'default' : 'success'}
                    variant={planned ? 'outlined' : 'filled'}
                />
                <Typography sx={{ fontWeight: 'bold' }}>{entry.sport ?? 'Endurance'}</Typography>
                <Typography variant="body2" color="text.secondary">{entry.startLocal.slice(11, 16)}</Typography>
            </Stack>
            {entry.name && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{entry.name}</Typography>}
            <Typography variant="body2" color="text.secondary">{facts.join(' · ')}</Typography>
            <Button size="small" href={entry.link} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />} sx={{ px: 0 }}>
                {entry.linkExact ? 'Open in Intervals.icu' : 'Open day in Intervals.icu'}
            </Button>
            {!entry.linkExact && <Typography variant="caption" component="p" color="text.secondary">
                Planned workouts have no page of their own in Intervals, this opens the calendar day.
            </Typography>}
        </ListItem>
    );
};
