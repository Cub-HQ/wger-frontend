import { EnduranceWindow, getEnduranceEntries } from "@/components/Calendar/api/endurance";
import { QueryKey } from "@/core/lib/consts";
import { useQuery } from "@tanstack/react-query";

export const useEnduranceEntriesQuery = (window: EnduranceWindow) => useQuery({
    queryFn: () => getEnduranceEntries(window),
    queryKey: [QueryKey.ENDURANCE_ENTRIES, window],
});
