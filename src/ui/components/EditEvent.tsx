import { DateTime } from "luxon";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { CalendarInfo, OFCEvent } from "../../types";
import { parseRecurrence } from "../interop";
import { Notice } from "obsidian";

function makeChangeListener<T>(
    setState: React.Dispatch<React.SetStateAction<T>>,
    fromString: (val: string) => T
): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
    return (e) => setState(fromString(e.target.value));
}

interface EditEventProps {
    submit: (frontmatter: OFCEvent, calendarIndex: number) => Promise<void>;
    readonly calendars: {
        id: string;
        name: string;
        type: CalendarInfo["type"];
    }[];
    defaultCalendarIndex: number;
    initialEvent?: Partial<OFCEvent>;
    open?: () => Promise<void>;
    deleteEvent?: () => Promise<void>;
}

export const EditEvent = ({
    initialEvent,
    submit,
    open,
    deleteEvent,
    calendars,
    defaultCalendarIndex,
}: EditEventProps) => {
    const [date, setDate] = useState(
        initialEvent
            ? initialEvent.type === "single"
                ? initialEvent.date
                : initialEvent.type === "recurring"
                ? initialEvent.startRecur
                : initialEvent.type === "rrule"
                ? initialEvent.startDate
                : ""
            : ""
    );
    const [endDate, setEndDate] = useState(
        initialEvent && initialEvent.type === "single"
            ? initialEvent.endDate
            : undefined
    );

    let initialStartTime = "";
    let initialEndTime = "";
    if (initialEvent) {
        // @ts-ignore
        const { startTime, endTime } = initialEvent;
        initialStartTime = startTime || "";
        initialEndTime = endTime || "";
    }

    const [startTime, setStartTime] = useState(initialStartTime);
    const [endTime, setEndTime] = useState(initialEndTime);
    const [title, setTitle] = useState(initialEvent?.title || "");
    const [description, setDescription] = useState(
        initialEvent?.description || ""
    );
    const [isRecurring, setIsRecurring] = useState(
        initialEvent?.type === "recurring" || false
    );
    const [endRecur, setEndRecur] = useState("");

    const [recurrenceString, setRecurrenceString] = useState<string>(
        (initialEvent?.type === "recurring" ? initialEvent.recurrence : "") ||
            ""
    );

    const [allDay, setAllDay] = useState(initialEvent?.allDay || false);

    const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);

    const [complete, setComplete] = useState(
        initialEvent?.type === "single" &&
            initialEvent.completed !== null &&
            initialEvent.completed !== undefined
            ? initialEvent.completed
            : false
    );

    const [isTask, setIsTask] = useState(
        initialEvent &&
            (initialEvent as any).completed !== undefined &&
            (initialEvent as any).completed !== null
            ? true
            : (calendars[defaultCalendarIndex] as any)?.isTaskByDefault || false
    );

    useEffect(() => {
        // Only override if it is a new event TODO!
        if (!initialEvent?.title) {
            const selectedCalendar = calendars[calendarIndex];
            if (selectedCalendar) {
                // @ts-ignore
                setIsTask(selectedCalendar.isTaskByDefault || false);
            }
        }
    }, [calendarIndex, calendars, initialEvent]);

    const titleRef = useRef<HTMLInputElement>(null);
    const recurrenceRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (titleRef.current && window.innerWidth >= 500) {
            titleRef.current.focus();
        }
    }, [titleRef]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (isRecurring && !parseRecurrence(recurrenceString)) {
            if (recurrenceRef.current) {
                recurrenceRef.current.setCustomValidity(
                    "Invalid recurrence pattern. Use 'every week', 'every 2 days', etc."
                );
                recurrenceRef.current.reportValidity();
            }
            return;
        }

        await submit(
            {
                ...{ title, description },
                ...(allDay
                    ? { allDay: true }
                    : { allDay: false, startTime: startTime || "", endTime }),
                ...(isRecurring
                    ? {
                          type: "recurring",
                          recurrence: recurrenceString,
                          startRecur: date || undefined,
                          endRecur: endRecur || undefined,
                          completed: isTask
                              ? initialEvent?.type === "recurring"
                                  ? initialEvent.completed
                                  : false
                              : null,
                      }
                    : {
                          type: "single",
                          date: date || "",
                          endDate: endDate || null,
                          completed: isTask ? complete : null,
                      }),
            },
            calendarIndex
        );
    };

    return (
        <>
            <div>
                <p style={{ float: "right" }}>
                    {open && <button onClick={open}>Open Note</button>}
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <p>
                    <input
                        ref={titleRef}
                        type="text"
                        id="title"
                        value={title}
                        placeholder={"Add title"}
                        required
                        onChange={makeChangeListener(setTitle, (x) => x)}
                    />
                </p>
                <p>
                    <textarea
                        id="description"
                        value={description}
                        placeholder={"Add description"}
                        style={{ width: "100%", height: "4em", resize: "none" }}
                        onChange={(e) =>
                            setDescription(e.target.value.replace(/\n/g, " "))
                        }
                        onBlur={(e) =>
                            setDescription(e.target.value.replace(/\n/g, " "))
                        }
                    />
                </p>
                <p>
                    <select
                        id="calendar"
                        value={calendarIndex}
                        onChange={makeChangeListener(
                            setCalendarIndex,
                            parseInt
                        )}
                    >
                        {calendars.map((cal, idx) => (
                            <option
                                key={idx}
                                value={idx}
                                disabled={
                                    !(
                                        initialEvent?.title === undefined ||
                                        calendars[calendarIndex].id === cal.id
                                    )
                                }
                            >
                                {cal.type === "local"
                                    ? cal.name
                                    : cal.type === "dailynote"
                                    ? "Daily Note"
                                    : cal.name}
                            </option>
                        ))}
                    </select>
                </p>
                <p>
                    {!isRecurring && (
                        <input
                            type="date"
                            id="date"
                            value={date}
                            required={!isRecurring}
                            // @ts-ignore
                            onChange={makeChangeListener(setDate, (x) => x)}
                        />
                    )}

                    {allDay ? (
                        <></>
                    ) : (
                        <>
                            <input
                                type="time"
                                id="startTime"
                                value={startTime}
                                required
                                onChange={makeChangeListener(
                                    setStartTime,
                                    (x) => x
                                )}
                            />
                            -
                            <input
                                type="time"
                                id="endTime"
                                value={endTime}
                                required
                                onChange={makeChangeListener(
                                    setEndTime,
                                    (x) => x
                                )}
                            />
                        </>
                    )}
                </p>
                <p>
                    <label htmlFor="allDay">All day event </label>
                    <input
                        id="allDay"
                        checked={allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                        type="checkbox"
                    />
                </p>
                <p>
                    <label htmlFor="recurring">Recurring Event </label>
                    <input
                        id="recurring"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        type="checkbox"
                    />
                </p>

                {isRecurring && (
                    <>
                        <p>
                            <label htmlFor="recurrenceStr">
                                Pattern (e.g., every 2 days){" "}
                            </label>
                            <input
                                type="text"
                                id="recurrenceStr"
                                ref={recurrenceRef}
                                value={recurrenceString}
                                placeholder="every week"
                                required={isRecurring}
                                onInput={(e) =>
                                    e.currentTarget.setCustomValidity("")
                                }
                                onChange={makeChangeListener(
                                    setRecurrenceString,
                                    (x) => x
                                )}
                            />
                        </p>
                        <p>
                            Starts recurring
                            <input
                                type="date"
                                id="startDate"
                                value={date}
                                // @ts-ignore
                                onChange={makeChangeListener(setDate, (x) => x)}
                            />
                            and stops recurring
                            <input
                                type="date"
                                id="endDate"
                                value={endRecur}
                                onChange={makeChangeListener(
                                    setEndRecur,
                                    (x) => x
                                )}
                            />
                            <button
                                type="button"
                                style={{ marginLeft: "10px" }}
                                onClick={() => {
                                    const baseDateStr =
                                        (initialEvent as any)?.instanceDate ||
                                        date ||
                                        DateTime.now().toISODate();
                                    const baseDate =
                                        DateTime.fromISO(baseDateStr);
                                    setEndRecur(
                                        baseDate.plus({ days: 1 }).toISODate()
                                    );
                                }}
                            >
                                Stop after this
                            </button>
                        </p>
                    </>
                )}
                <p>
                    <label htmlFor="task">Task Event </label>
                    <input
                        id="task"
                        checked={isTask}
                        onChange={(e) => {
                            setIsTask(e.target.checked);
                        }}
                        type="checkbox"
                    />
                </p>

                {isTask && (
                    <>
                        <label htmlFor="taskStatus">Complete? </label>
                        <input
                            id="taskStatus"
                            checked={
                                !(complete === false || complete === undefined)
                            }
                            onChange={(e) =>
                                setComplete(
                                    e.target.checked
                                        ? DateTime.now().toISO()
                                        : false
                                )
                            }
                            type="checkbox"
                        />
                    </>
                )}

                <p
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                    }}
                >
                    <button type="submit"> Save Event </button>
                    <span>
                        {deleteEvent && (
                            <button
                                type="button"
                                style={{
                                    backgroundColor:
                                        "var(--interactive-normal)",
                                    color: "var(--background-modifier-error)",
                                    borderColor:
                                        "var(--background-modifier-error)",
                                    borderWidth: "1px",
                                    borderStyle: "solid",
                                }}
                                onClick={deleteEvent}
                            >
                                Delete Event
                            </button>
                        )}
                    </span>
                </p>
            </form>
        </>
    );
};
