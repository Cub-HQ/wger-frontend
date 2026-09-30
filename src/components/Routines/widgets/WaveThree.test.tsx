import { editSession } from "@/components/Routines/api/session";
import { WorkoutSession } from "@/components/Routines/models/WorkoutSession";
import { SessionMetadataEditor, SessionTimer } from "@/components/Routines/widgets/WaveThree";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";

vi.mock("@/components/Routines/api/session");

const anchor = new Date("2025-08-07T06:00:00+10:00");
const session = (overrides: Partial<ConstructorParameters<typeof WorkoutSession>[0]>) => new WorkoutSession({
    id: "bbbbbbbb-bbbb-bbbb-bbbb-000000000005", dayId: 5, routineId: 1, notes: "imported", impression: "2",
    datetimeStart: anchor, datetimeEnd: anchor, ...overrides,
});

describe("Session timing", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        localStorage.clear();
        (editSession as Mock).mockImplementation(async (draft: WorkoutSession) => draft);
    });

    test("unknown timing never offers a timer, even with its end cleared or a stale timer stored", () => {
        const unknown = session({ datetimeEnd: null, timeUnknown: true });
        localStorage.setItem(`wger.sessionTimer.${unknown.id}`, String(anchor.getTime()));

        const { container } = render(<SessionTimer session={unknown} onSaved={vi.fn()} />);

        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByText("Start now")).toBeNull();
    });

    test("an open session with known timing still offers the timer", () => {
        render(<SessionTimer session={session({ datetimeEnd: null })} onSaved={vi.fn()} />);

        expect(screen.getByRole("button", { name: "Start now" })).toBeInTheDocument();
    });

    test("unknown timing is read-only and a notes save keeps the flag and the anchors", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        render(<SessionMetadataEditor session={session({ timeUnknown: true })} onSaved={onSaved} />);

        expect(screen.getByText(/Time\/duration unknown/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Start")).toBeNull();
        expect(screen.queryByLabelText("End")).toBeNull();
        expect(editSession).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText("Notes"), " edited");
        await user.click(screen.getByRole("button", { name: "Save session details" }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        const draft = (editSession as Mock).mock.calls[0][0] as WorkoutSession;
        expect(draft.notes).toBe("imported edited");
        expect(draft.timeUnknown).toBe(true);
        expect(draft.datetimeStart).toEqual(anchor);
        expect(draft.datetimeEnd).toEqual(anchor);
    });

    test("known timing keeps its editable start and end", () => {
        render(<SessionMetadataEditor session={session({ datetimeEnd: new Date(2025, 7, 7, 11) })} onSaved={vi.fn()} />);

        expect(screen.getByLabelText("Start")).toBeInTheDocument();
        expect(screen.getByLabelText("End")).toBeInTheDocument();
        expect(screen.queryByText(/Time\/duration unknown/)).toBeNull();
    });
});
