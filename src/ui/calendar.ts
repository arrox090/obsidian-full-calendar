import {
    Calendar,
    EventApi,
    EventClickArg,
    EventHoveringArg,
    EventSourceInput,
} from "@fullcalendar/core";
import { DateClickArg } from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import rrulePlugin from "@fullcalendar/rrule";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import googleCalendarPlugin from "@fullcalendar/google-calendar";
import iCalendarPlugin from "@fullcalendar/icalendar";

// There is an issue with FullCalendar RRule support around DST boundaries which is fixed by this monkeypatch:
// https://github.com/fullcalendar/fullcalendar/issues/5273#issuecomment-1360459342
rrulePlugin.recurringTypes[0].expand = function (errd, fr, de) {
    const hours = errd.rruleSet._dtstart.getHours();
    return errd.rruleSet
        .between(de.toDate(fr.start), de.toDate(fr.end), true)
        .map((d: Date) => {
            return new Date(
                Date.UTC(
                    d.getFullYear(),
                    d.getMonth(),
                    d.getDate(),
                    hours,
                    d.getMinutes()
                )
            );
        });
};

interface ExtraRenderProps {
    eventClick?: (info: EventClickArg) => void;
    eventDblClick?: (info: EventClickArg) => void;
    dateClick?: (info: DateClickArg) => void;
    dateDblClick?: (info: DateClickArg) => void;
    select?: (
        startDate: Date,
        endDate: Date,
        allDay: boolean,
        viewType: string
    ) => Promise<void>;
    selectDblClick?: (
        startDate: Date,
        endDate: Date,
        allDay: boolean,
        viewType: string
    ) => Promise<void>;
    modifyEvent?: (event: EventApi, oldEvent: EventApi) => Promise<boolean>;
    eventMouseEnter?: (info: EventHoveringArg) => void;
    firstDay?: number;
    initialView?: { desktop: string; mobile: string };
    timeFormat24h?: boolean;
    openContextMenuForEvent?: (
        event: EventApi,
        mouseEvent: MouseEvent
    ) => Promise<void>;
    toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
    forceNarrow?: boolean;
}

export function renderCalendar(
    containerEl: HTMLElement,
    eventSources: EventSourceInput[],
    settings?: ExtraRenderProps
): Calendar {
    const isMobile = window.innerWidth < 500;
    const isNarrow = settings?.forceNarrow || isMobile;

    const {
        eventClick,
        eventDblClick,
        dateClick,
        dateDblClick,
        select,
        selectDblClick,
        modifyEvent,
        eventMouseEnter,
        openContextMenuForEvent,
        toggleTask,
        timeFormat24h,
    } = settings || {};

    let clickTimeout: any = null;
    let selectTimeout: any = null;
    let dateTimeout: any = null;

    const modifyEventCallback =
        modifyEvent &&
        (async ({
            event,
            oldEvent,
            revert,
        }: {
            event: EventApi;
            oldEvent: EventApi;
            revert: () => void;
        }) => {
            const success = await modifyEvent(event, oldEvent);
            if (!success) {
                revert();
            }
        });

    const cal = new Calendar(containerEl, {
        plugins: [
            // View plugins
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            // Drag + drop and editing
            interactionPlugin,
            // Remote sources
            googleCalendarPlugin,
            iCalendarPlugin,
            rrulePlugin,
        ],
        googleCalendarApiKey: "AIzaSyDIiklFwJXaLWuT_4y6I9ZRVVsPuf4xGrk",
        initialView:
            settings?.initialView?.[isNarrow ? "mobile" : "desktop"] ||
            (isNarrow ? "timeGrid3Days" : "timeGridWeek"),
        nowIndicator: true,
        scrollTimeReset: false,
        dayMaxEvents: isMobile ? 6 : true,

        headerToolbar: isMobile
            ? {
                  left: "title",
                  right: "prev,next",
              }
            : !isNarrow
            ? {
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }
            : {
                  right: "today,prev,next",
                  left: "timeGrid3Days,timeGridDay,listWeek",
              },
        footerToolbar: isMobile
            ? {
                  center: "dayGridMonth,timeGrid3Days,timeGridDay,listWeek today",
              }
            : false,

        views: {
            dayGridMonth: {
                buttonText: isNarrow ? "M" : "month",
                dayMaxEvents: isMobile ? 12 : true,
            },
            timeGridDay: {
                type: "timeGrid",
                duration: { days: 1 },
                buttonText: isNarrow ? "1" : "day",
            },
            timeGrid3Days: {
                type: "timeGrid",
                duration: { days: 3 },
                buttonText: "3",
            },
            listWeek: {
                buttonText: isNarrow ? "L" : "list",
            },
        },
        firstDay: settings?.firstDay,
        ...(settings?.timeFormat24h && {
            eventTimeFormat: {
                hour: "numeric",
                minute: "2-digit",
                hour12: false,
            },
            slotLabelFormat: {
                hour: "numeric",
                minute: "2-digit",
                hour12: false,
            },
        }),
        eventSources,
        eventClick: (info) => {
            if (eventDblClick) {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    eventDblClick(info);
                } else {
                    const infoCopy = { ...info };
                    clickTimeout = setTimeout(() => {
                        clickTimeout = null;
                        eventClick?.(infoCopy);
                    }, 150);
                }
            } else {
                eventClick?.(info);
            }
        },

        selectable: (select || selectDblClick) && true,
        selectMirror: (select || selectDblClick) && true,
        select: async (info) => {
            info.view.calendar.unselect();
            if (selectDblClick) {
                if (selectTimeout) {
                    clearTimeout(selectTimeout);
                    selectTimeout = null;
                    await selectDblClick(
                        info.start,
                        info.end,
                        info.allDay,
                        info.view.type
                    );
                } else {
                    const { start, end, allDay, view } = info;
                    const viewType = view.type;
                    selectTimeout = setTimeout(async () => {
                        selectTimeout = null;
                        if (select) {
                            await select(start, end, allDay, viewType);
                        }
                    }, 130);
                }
            } else if (select) {
                await select(info.start, info.end, info.allDay, info.view.type);
            }
        },
        dateClick: (info) => {
            if (dateDblClick) {
                if (dateTimeout) {
                    clearTimeout(dateTimeout);
                    dateTimeout = null;
                    dateDblClick(info);
                } else {
                    const infoCopy = { ...info };
                    dateTimeout = setTimeout(() => {
                        dateTimeout = null;
                        dateClick?.(infoCopy);
                    }, 130);
                }
            } else {
                dateClick?.(info);
            }
        },

        editable: modifyEvent && true,
        eventDrop: modifyEventCallback,
        eventResize: modifyEventCallback,

        eventContent: (arg) => {
            const isMobile = window.innerWidth < 500;
            const isMonthView = arg.view.type === "dayGridMonth";

            if (isMobile && isMonthView) {
                const dot = document.createElement("div");
                dot.addClass("ofc-mobile-dot");
                dot.style.backgroundColor =
                    arg.backgroundColor || "var(--interactive-accent)";
                return { domNodes: [dot] };
            }
            return undefined;
        },

        eventDidMount: ({ event, el, textColor }) => {
            el.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                openContextMenuForEvent && openContextMenuForEvent(event, e);
            });

            const description = event.extendedProps.description;
            const recurrence = event.extendedProps.recurrence;
            const timeStr = event.allDay
                ? "All Day"
                : `${event.start?.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: !timeFormat24h,
                  })} - ${event.end?.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: !timeFormat24h,
                  })}`;

            el.title = `📌 ${event.title}\n⏰ ${timeStr}${
                recurrence ? `\n🔁 ${recurrence}` : ""
            }${description ? `\n\n📝 ${description}` : ""}`;

            const titleEl =
                el.querySelector(".fc-event-title") ||
                el.querySelector(".fc-list-event-title");

            const isDayGrid =
                el.closest(".fc-daygrid-event") !== null ||
                el.classList.contains("fc-daygrid-event");

            if (titleEl && !isDayGrid && description) {
                const descEl = document.createElement("div");
                descEl.addClass("ofc-event-description");
                descEl.innerText = description;

                // In List view, titleEl is often a span or a div that needs to contain the description
                // to stay clickable and correctly aligned.
                titleEl.appendChild(descEl);
            }

            if (toggleTask) {
                if (event.extendedProps.isTask) {
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.checked =
                        event.extendedProps.taskCompleted !== false;
                    checkbox.onclick = async (e) => {
                        e.stopPropagation();
                        if (e.target) {
                            let ret = await toggleTask(
                                event,
                                (e.target as HTMLInputElement).checked
                            );
                            if (!ret) {
                                (e.target as HTMLInputElement).checked = !(
                                    e.target as HTMLInputElement
                                ).checked;
                            }
                        }
                    };
                    // Make the checkbox more visible against different color events.
                    if (textColor == "black") {
                        checkbox.addClass("ofc-checkbox-black");
                    } else {
                        checkbox.addClass("ofc-checkbox-white");
                    }

                    if (checkbox.checked) {
                        el.addClass("ofc-task-completed");
                    }

                    // Depending on the view, we should put the checkbox in a different spot.
                    const container =
                        el.querySelector(".fc-event-time") ||
                        el.querySelector(".fc-event-title") ||
                        el.querySelector(".fc-list-event-title");

                    container?.addClass("ofc-has-checkbox");
                    container?.prepend(checkbox);
                }
            }
        },

        longPressDelay: 250,
        selectLongPressDelay: 250,
    });
    cal.render();
    return cal;
}
