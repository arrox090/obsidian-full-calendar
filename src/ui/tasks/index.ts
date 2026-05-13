import { DateTime } from "luxon";
import { OFCEvent } from "src/types";

export const isTask = (e: OFCEvent) =>
    (e.type === "single" || e.type === "recurring") &&
    (e as any).completed !== undefined &&
    (e as any).completed !== null;

export const unmakeTask = (event: OFCEvent): OFCEvent => {
    if (event.type === "single") {
        return { ...event, completed: null };
    }
    return event;
};

export const toggleTask = (event: OFCEvent, isDone: boolean): OFCEvent => {
    if (event.type === "single") {
        if (isDone) {
            return { ...event, completed: DateTime.now().toISO() };
        } else {
            return { ...event, completed: false };
        }
    }
    return event;
};
