import { EventApi, EventInput } from "@fullcalendar/core";
import { OFCEvent } from "../types";

import { DateTime, Duration } from "luxon";
import { rrulestr, RRule } from "rrule";

/*
 * Functions for converting between the types used by the FullCalendar view plugin and types used internally by Obsidian Full Calendar.
 */

export const parseRecurrence = (
    recurrence: string
): { freq: number; interval?: number } | null => {
    const r = recurrence.toLowerCase().trim();
    // Handles: "every day", "every 2 days", "every week", "every month", etc.
    const match = r.match(/^every\s+(\d+\s+)?(day|week|month|year)s?$/);
    if (!match) return null;

    const interval = match[1] ? parseInt(match[1].trim()) : 1;
    const unit = match[2];

    let freq: number;
    switch (unit) {
        case "day":
            freq = RRule.DAILY;
            break;
        case "week":
            freq = RRule.WEEKLY;
            break;
        case "month":
            freq = RRule.MONTHLY;
            break;
        case "year":
            freq = RRule.YEARLY;
            break;
        default:
            return null;
    }

    return { freq, interval };
};

const parseTime = (time: string): Duration | null => {
    let parsed = DateTime.fromFormat(time, "h:mm a");
    if (parsed.invalidReason) {
        parsed = DateTime.fromFormat(time, "HH:mm");
    }
    if (parsed.invalidReason) {
        parsed = DateTime.fromFormat(time, "HH:mm:ss");
    }

    if (parsed.invalidReason) {
        console.error(
            `FC: Error parsing time string '${time}': ${parsed.invalidReason}'`
        );
        return null;
    }

    return Duration.fromISOTime(
        parsed.toISOTime({
            includeOffset: false,
            includePrefix: false,
        })
    );
};

const normalizeTimeString = (time: string): string | null => {
    const parsed = parseTime(time);
    if (!parsed) {
        return null;
    }
    return parsed.toISOTime({
        suppressMilliseconds: true,
        includePrefix: false,
        suppressSeconds: true,
    });
};

const add = (date: DateTime, time: Duration): DateTime => {
    let hours = time.hours;
    let minutes = time.minutes;
    return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date): string =>
    DateTime.fromJSDate(date).toISOTime({
        suppressMilliseconds: true,
        includeOffset: false,
        suppressSeconds: true,
    });

const getDate = (date: Date): string => DateTime.fromJSDate(date).toISODate();

const combineDateTimeStrings = (date: string, time: string): string | null => {
    const parsedDate = DateTime.fromISO(date);
    if (parsedDate.invalidReason) {
        console.error(
            `FC: Error parsing time string '${date}': ${parsedDate.invalidReason}`
        );
        return null;
    }

    const parsedTime = parseTime(time);
    if (!parsedTime) {
        return null;
    }

    return add(parsedDate, parsedTime).toISO({
        includeOffset: false,
        suppressMilliseconds: true,
    });
};

const DAYS = "UMTWRFS";

export function dateEndpointsToFrontmatter(
    start: Date,
    end: Date,
    allDay: boolean
): Partial<OFCEvent> {
    const date = getDate(start);
    const endDate = getDate(end);
    return {
        type: "single",
        date,
        endDate: date !== endDate ? endDate : undefined,
        allDay,
        ...(allDay
            ? {}
            : {
                  startTime: getTime(start),
                  endTime: getTime(end),
              }),
    };
}

export function toEventInput(
    id: string,
    frontmatter: OFCEvent
): EventInput | null {
    let event: EventInput = {
        id,
        title: frontmatter.title,
        allDay: frontmatter.allDay,
        extendedProps: {
            description: frontmatter.description,
        },
    };
    if (frontmatter.type === "recurring") {
        const parsed = parseRecurrence(frontmatter.recurrence);
        if (parsed) {
            const dtstart = (() => {
                if (frontmatter.allDay) {
                    return DateTime.fromISO(frontmatter.startRecur || "");
                } else {
                    return DateTime.fromISO(
                        combineDateTimeStrings(
                            frontmatter.startRecur || "",
                            frontmatter.startTime || ""
                        ) || ""
                    );
                }
            })();

            const rrule = new RRule({
                freq: parsed.freq,
                interval: parsed.interval,
                dtstart: dtstart.toJSDate(),
                until: frontmatter.endRecur
                    ? DateTime.fromISO(frontmatter.endRecur).toJSDate()
                    : undefined,
            });
            event = {
                ...event,
                rrule: rrule.toString(),
                extendedProps: {
                    ...event.extendedProps,
                    isTask: false,
                    recurrence: frontmatter.recurrence,
                },
            };
        } else {
            event = {
                ...event,
                startRecur: frontmatter.startRecur,
                endRecur: frontmatter.endRecur,
                extendedProps: {
                    ...event.extendedProps,
                    isTask: false,
                    // Store your custom natural language string here for the UI to access
                    recurrence: frontmatter.recurrence,
                },
            };
        }
        if (!frontmatter.allDay) {
            event = {
                ...event,
                startTime: normalizeTimeString(frontmatter.startTime || ""),
                endTime: frontmatter.endTime
                    ? normalizeTimeString(frontmatter.endTime)
                    : undefined,
            };
        }
    } else if (frontmatter.type === "rrule") {
        const dtstart = (() => {
            if (frontmatter.allDay) {
                return DateTime.fromISO(frontmatter.startDate);
            } else {
                const dtstartStr = combineDateTimeStrings(
                    frontmatter.startDate,
                    frontmatter.startTime
                );

                if (!dtstartStr) {
                    return null;
                }
                return DateTime.fromISO(dtstartStr);
            }
        })();
        if (dtstart === null) {
            return null;
        }
        const exdate = frontmatter.skipDates
            .map((d) => {
                const date = DateTime.fromISO(d).toISODate();
                const time = dtstart.toJSDate().toISOString().split("T")[1];

                return `${date}T${time}`;
            })
            .flatMap((d) => (d ? d : []));

        event = {
            id,
            title: frontmatter.title,
            allDay: frontmatter.allDay,
            rrule: rrulestr(frontmatter.rrule, {
                dtstart: dtstart.toJSDate(),
            }).toString(),
            exdate,
            extendedProps: {
                ...event.extendedProps,
            },
        };

        if (!frontmatter.allDay) {
            const startTime = parseTime(frontmatter.startTime);
            if (startTime && frontmatter.endTime) {
                const endTime = parseTime(frontmatter.endTime);
                const duration = endTime?.minus(startTime);
                if (duration) {
                    event.duration = duration.toISOTime({
                        includePrefix: false,
                        suppressMilliseconds: true,
                        suppressSeconds: true,
                    });
                }
            }
        }
    } else if (frontmatter.type === "single") {
        if (!frontmatter.allDay) {
            const start = combineDateTimeStrings(
                frontmatter.date,
                frontmatter.startTime
            );
            if (!start) {
                return null;
            }
            let end = undefined;
            if (frontmatter.endTime) {
                end = combineDateTimeStrings(
                    frontmatter.endDate || frontmatter.date,
                    frontmatter.endTime
                );
                if (!end) {
                    return null;
                }
            }

            event = {
                ...event,
                start,
                end,
                extendedProps: {
                    ...event.extendedProps,
                    isTask:
                        frontmatter.completed !== undefined &&
                        frontmatter.completed !== null,
                    taskCompleted: frontmatter.completed,
                },
            };
        } else {
            event = {
                ...event,
                start: frontmatter.date,
                end: frontmatter.endDate || undefined,
                extendedProps: {
                    ...event.extendedProps,
                    isTask:
                        frontmatter.completed !== undefined &&
                        frontmatter.completed !== null,
                    taskCompleted: frontmatter.completed,
                },
            };
        }
    }

    return event;
}

export function fromEventApi(event: EventApi): OFCEvent {
    // Detect if the event is our new custom recurring type
    const recurrenceStr = event.extendedProps.recurrence;
    const isRecurring = recurrenceStr !== undefined;

    const startDate = getDate(event.start as Date);
    const endDate = getDate(event.end as Date);

    return {
        title: event.title,
        description: event.extendedProps.description,
        ...(event.allDay
            ? { allDay: true }
            : {
                  allDay: false,
                  startTime: getTime(event.start as Date),
                  endTime: getTime(event.end as Date),
              }),

        ...(isRecurring
            ? {
                  type: "recurring",
                  recurrence: recurrenceStr,
                  startRecur:
                      event.extendedProps.startRecur &&
                      getDate(event.extendedProps.startRecur),
                  endRecur:
                      event.extendedProps.endRecur &&
                      getDate(event.extendedProps.endRecur),
              }
            : {
                  type: "single",
                  date: startDate,
                  ...(startDate !== endDate ? { endDate } : { endDate: null }),
                  completed: event.extendedProps.taskCompleted,
              }),
    } as OFCEvent;
}
