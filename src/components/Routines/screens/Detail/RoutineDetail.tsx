import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import { WgerContainerRightSidebar } from "@/core/ui/Widgets/Container";
import { RenderLoadingQuery } from "@/core/ui/Widgets/RenderLoadingQuery";
import { MuscleOverview } from "@/components/Muscles/MuscleOverview";
import { useRoutineDetailQuery } from "@/components/Routines/queries";
import { RoutineDetailDropdown } from "@/components/Routines/widgets/RoutineDetailDropdown";
import { DayDetailsCard } from "@/components/Routines/widgets/RoutineDetailsCard";
import i18n from "@/i18n";
import { Routine } from "@/components/Routines/models/Routine";
import React from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { dateToLocale, dateToYYYYMMDD, yyyymmddToDate } from "@/core/lib/date";
import { makeLink, WgerLink } from "@/core/lib/url";

/*
 * Resolves the planned occurrence linked as ?day={dayId}&date=YYYY-MM-DD.
 *
 * Returns undefined when neither parameter is set (normal view) and null when
 * the link can't be resolved: malformed values, a day of another routine or a
 * date on which that day isn't scheduled. Never falls back to another day.
 */
export function selectPlannedOccurrence(routine: Routine, dayParam: string | null, dateParam: string | null) {
    if (dayParam === null && dateParam === null) {
        return undefined;
    }
    if (!/^\d+$/.test(dayParam ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '')) {
        return null;
    }

    const date = yyyymmddToDate(dateParam!);
    // Rejects impossible dates such as 2026-02-30, which Date rolls over
    if (dateToYYYYMMDD(date) !== dateParam) {
        return null;
    }

    const day = routine.days.find(d => d.id === Number(dayParam));
    const dayData = day ? routine.getDayData(day.id!, date)[0] : undefined;
    return day && dayData ? { day, dayData } : null;
}


export const RoutineDetail = () => {
    const { t } = useTranslation();
    const params = useParams<{ routineId: string }>();
    const [searchParams] = useSearchParams();
    const routineId = parseInt(params.routineId ?? '');
    if (Number.isNaN(routineId)) {
        return <p>Please pass an integer as the routine id.</p>;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const routineQuery = useRoutineDetailQuery(routineId);

    const routine = routineQuery.data;
    const subtitle = routine !== undefined ? `${dateToLocale(routine!.start)} - ${dateToLocale(routine!.end)} (${routine?.durationText})` : '';
    const chip = routine?.isTemplate
        ? <Chip color="info" size="small" label={t('routines.template')} />
        : null;
    const planned = routine && selectPlannedOccurrence(routine, searchParams.get('day'), searchParams.get('date'));

    return <RenderLoadingQuery
        query={routineQuery}
        child={routineQuery.isSuccess
            && <WgerContainerRightSidebar
                title={<>{routine!.name} {chip}</>}
                subTitle={subtitle}
                optionsMenu={<RoutineDetailDropdown routine={routineQuery.data!} />}
                mainContent={
                    <Stack spacing={2}>

                        {routine!.description !== ''
                            && <Typography variant={"body2"} sx={{ whiteSpace: 'pre-line' }}>
                                {routine?.description}
                            </Typography>
                        }

                        {routine!.isTemplate && <Button
                            component="a"
                            href={makeLink(WgerLink.ROUTINE_COPY, i18n.language, { id: routineId })}
                            variant={"contained"}
                        >{t('routines.copyAndUseTemplate')}</Button>}
                        {planned === undefined && routine!.daysCurrentIteration.map(({ day, dayData }) =>
                            <DayDetailsCard
                                routineId={routineId}
                                day={day}
                                dayData={dayData}
                                key={`dayDetails-${day.id}`}
                                readOnly={routine!.isTemplate}
                            />
                        )}

                        {planned === null && <Alert severity="warning">{t('routines.plannedOccurrenceUnavailable')}</Alert>}

                        {planned && <>
                            <Typography variant="h6">
                                {t('routines.plannedFor', { date: dateToLocale(planned.dayData.date) })}
                                {' · '}
                                {t('routines.iterationNr', { number: planned.dayData.iteration })}
                            </Typography>
                            <DayDetailsCard
                                routineId={routineId}
                                day={planned.day}
                                dayData={planned.dayData}
                                readOnly
                            />
                        </>}

                        {planned !== undefined && <Button
                            href={makeLink(WgerLink.ROUTINE_DETAIL, i18n.language, { id: routineId })}
                            sx={{ alignSelf: 'flex-start' }}
                        >{t('routines.backToRoutine')}</Button>}
                    </Stack>
                }
                sideBar={
                    <Stack>
                        <Box sx={{ height: 40 }} />
                        <Grid container>
                            <Grid size={6}>
                                <MuscleOverview
                                    primaryMuscles={routine!.mainMuscles.filter(m => m.isFront)}
                                    secondaryMuscles={routine!.secondaryMuscles.filter(m => m.isFront)}
                                    isFront={true}
                                />
                            </Grid>
                            <Grid size={6}>
                                <MuscleOverview
                                    primaryMuscles={routine!.mainMuscles.filter(m => !m.isFront)}
                                    secondaryMuscles={routine!.secondaryMuscles.filter(m => !m.isFront)}
                                    isFront={false}
                                />
                            </Grid>
                        </Grid>
                    </Stack>
                }
            />}
    />;
};