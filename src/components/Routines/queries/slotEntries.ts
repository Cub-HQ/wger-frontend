import { addSlotEntry, deleteSlotEntry, editSlotEntry } from "@/components/Routines/api/slotEntry";
import { SlotEntry } from "@/components/Routines/models/SlotEntry";
import { QueryKey, } from "@/core/lib/consts";
import { useMutation, useQueryClient } from "@tanstack/react-query";


export const useEditSlotEntryQuery = (routineId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (slotEntry: SlotEntry) => editSlotEntry(slotEntry),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, routineId] })
    });
};

export const useAddSlotEntryQuery = (routineId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (slotEntry: SlotEntry) => addSlotEntry(slotEntry),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, routineId] })
    });
};

export const useDeleteSlotEntryQuery = (routineId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (slotId: number) => deleteSlotEntry(slotId),
        // Also on failure: a refused delete (e.g. the item has logged workouts) must show the item again
        onSettled: () => queryClient.invalidateQueries({ queryKey: [QueryKey.ROUTINE_DETAIL, routineId] })
    });
};
