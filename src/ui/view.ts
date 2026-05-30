import "./overrides.css";
import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import { Calendar, EventSourceInput } from "@fullcalendar/core";
import { DateTime } from "luxon";
import { renderCalendar } from "./calendar";
import FullCalendarPlugin from "../main";
import { FCError, PLUGIN_SLUG } from "../types";
import {
    dateEndpointsToFrontmatter,
    fromEventApi,
    toEventInput,
} from "./interop";
import { renderOnboarding } from "./onboard";
import { openFileForEvent } from "./actions";
import { launchCreateModal, launchEditModal } from "./event_modal";
import { isTask, toggleTask, unmakeTask } from "src/ui/tasks";
import { UpdateViewCallback } from "src/core/EventCache";

export const FULL_CALENDAR_VIEW_TYPE = "full-calendar-view";
export const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = "full-calendar-sidebar-view";

function getCalendarColors(color: string | null | undefined): {
    color: string;
    textColor: string;
} {
    let textVar = getComputedStyle(document.body).getPropertyValue(
        "--text-on-accent"
    );
    if (color) {
        const m = color
            .slice(1)
            .match(color.length == 7 ? /(\S{2})/g : /(\S{1})/g);
        if (m) {
            const r = parseInt(m[0], 16),
                g = parseInt(m[1], 16),
                b = parseInt(m[2], 16);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness > 150) {
                textVar = "black";
            }
        }
    }

    return {
        color:
            color ||
            getComputedStyle(document.body).getPropertyValue(
                "--interactive-accent"
            ),
        textColor: textVar,
    };
}

export class CalendarView extends ItemView {
    plugin: FullCalendarPlugin;
    inSidebar: boolean;
    fullCalendarView: Calendar | null = null;
    callback: UpdateViewCallback | null = null;
    private isNavigating = false;
    private calendarEl: HTMLElement | null = null;

    // Zoom state
    private pinchStartDist = 0;
    private initialSlotHeight = 0;
    private currentZoomHeight = 0;
    private zoomStartTimeOffset = 0;
    private isZooming = false;

    constructor(
        leaf: WorkspaceLeaf,
        plugin: FullCalendarPlugin,
        inSidebar = false
    ) {
        super(leaf);
        this.plugin = plugin;
        this.inSidebar = inSidebar;
    }

    getIcon(): string {
        return "calendar-glyph";
    }

    getViewType() {
        return this.inSidebar
            ? FULL_CALENDAR_SIDEBAR_VIEW_TYPE
            : FULL_CALENDAR_VIEW_TYPE;
    }

    getDisplayText() {
        return this.inSidebar ? "Full Calendar" : "Calendar";
    }

    refreshSlotHeight(height: number) {
        if (this.fullCalendarView) {
            this.containerEl.style.setProperty(
                "--fc-slot-min-height",
                `${height}px`
            );
            (this.fullCalendarView as any).setOption("slotMinHeight", height);
        }
    }

    translateSources() {
        return this.plugin.cache.getAllEvents().map(
            ({ events, editable, color, id }): EventSourceInput => ({
                id,
                events: events.flatMap(
                    (e) => toEventInput(e.id, e.event) || []
                ),
                editable,
                ...getCalendarColors(color),
            })
        );
    }

    async onOpen() {
        await this.plugin.loadSettings();
        if (!this.plugin.cache) {
            new Notice("Full Calendar event cache not loaded.");
            return;
        }
        if (!this.plugin.cache.initialized) {
            await this.plugin.cache.populate();
        }

        const container = this.containerEl.children[1];
        container.empty();
        let calendarEl = container.createEl("div");
        this.calendarEl = calendarEl;

        if (
            this.plugin.settings.calendarSources.filter(
                (s) => s.type !== "FOR_TEST_ONLY"
            ).length === 0
        ) {
            renderOnboarding(this.app, this.plugin, calendarEl);
            return;
        }

        const sources: EventSourceInput[] = this.translateSources();

        // Set the slot height from settings
        document.body.style.setProperty(
            "--fc-slot-min-height",
            `${this.plugin.settings.timeSlotHeight}px`
        );

        // Attach Zoom Listeners using Obsidian's registration for safety
        this.registerDomEvent(this.containerEl, "wheel", this.handleWheel, {
            passive: false,
            capture: true,
        });
        this.registerDomEvent(
            this.containerEl,
            "touchstart",
            this.handleTouchStart,
            {
                capture: true,
            }
        );
        this.registerDomEvent(
            this.containerEl,
            "touchmove",
            this.handleTouchMove,
            {
                passive: false,
                capture: true,
            }
        );
        this.registerDomEvent(
            this.containerEl,
            "touchend",
            this.handleTouchEnd,
            {
                capture: true,
            }
        );

        if (this.fullCalendarView) {
            this.fullCalendarView.destroy();
            this.fullCalendarView = null;
        }
        this.fullCalendarView = renderCalendar(calendarEl, sources, {
            forceNarrow: this.inSidebar,
            eventClick: async (info) => {
                if (this.isNavigating) return;
                try {
                    const instanceDate = info.event.start
                        ? info.event.start.toISOString().split("T")[0]
                        : undefined;
                    launchEditModal(this.plugin, info.event.id, instanceDate);
                } catch (e) {
                    if (e instanceof Error) {
                        console.warn(e);
                        new Notice(e.message);
                    }
                }
            },
            dateClick: async (info) => {
                if (this.isNavigating) return;
                if (info.view.type === "dayGridMonth") {
                    if (this.plugin.settings.clickToCreateEventFromMonthView) {
                        const partialEvent = dateEndpointsToFrontmatter(
                            info.date,
                            info.date,
                            info.allDay
                        );
                        try {
                            launchCreateModal(this.plugin, partialEvent);
                        } catch (e) {
                            if (e instanceof Error) {
                                console.error(e);
                                new Notice(e.message);
                            }
                        }
                        return;
                    }

                    this.isNavigating = true;
                    this.fullCalendarView?.changeView("timeGridDay");
                    this.fullCalendarView?.gotoDate(info.date);

                    // Force blur on the entire toolbar to remove focus outlines.
                    const toolbar =
                        this.containerEl.querySelector(".fc-header-toolbar");
                    if (toolbar instanceof HTMLElement) {
                        (
                            toolbar.querySelector(
                                ".fc-button-active"
                            ) as HTMLElement
                        )?.blur();
                        (document.activeElement as HTMLElement)?.blur();
                    }

                    setTimeout(() => {
                        this.isNavigating = false;
                    }, 500);
                }
            },
            dateDblClick: async (info) => {
                if (this.isNavigating) return;
                const partialEvent = dateEndpointsToFrontmatter(
                    info.date,
                    info.date,
                    info.allDay
                );
                try {
                    launchCreateModal(this.plugin, partialEvent);
                } catch (e) {
                    if (e instanceof Error) {
                        console.error(e);
                        new Notice(e.message);
                    }
                }
            },
            select: async (start, end, allDay, viewType) => {
                if (this.isNavigating) return;
                const isSingleDay =
                    DateTime.fromJSDate(start).toISODate() ===
                    DateTime.fromJSDate(end).minus({ days: 1 }).toISODate();

                if (viewType === "dayGridMonth" && isSingleDay) {
                    return; // Handled by dateClick to avoid double-triggering.
                }

                if (viewType === "dayGridMonth") {
                    end.setDate(end.getDate() - 1);
                }
                const partialEvent = dateEndpointsToFrontmatter(
                    start,
                    end,
                    allDay
                );
                try {
                    launchCreateModal(this.plugin, partialEvent);
                } catch (e) {
                    if (e instanceof Error) {
                        console.error(e);
                        new Notice(e.message);
                    }
                }
            },
            selectDblClick: async (start, end, allDay, viewType) => {
                if (this.isNavigating) return;
                const isSingleDay =
                    DateTime.fromJSDate(start).toISODate() ===
                    DateTime.fromJSDate(end).minus({ days: 1 }).toISODate();

                if (viewType === "dayGridMonth" && isSingleDay) {
                    return; // Handled by dateDblClick.
                }

                if (viewType === "dayGridMonth") {
                    end.setDate(end.getDate() - 1);
                }
                const partialEvent = dateEndpointsToFrontmatter(
                    start,
                    end,
                    allDay
                );
                try {
                    launchCreateModal(this.plugin, partialEvent);
                } catch (e) {
                    if (e instanceof Error) {
                        console.error(e);
                        new Notice(e.message);
                    }
                }
            },
            modifyEvent: async (newEvent, oldEvent) => {
                try {
                    const didModify = await this.plugin.cache.updateEventWithId(
                        oldEvent.id,
                        fromEventApi(newEvent)
                    );
                    return !!didModify;
                } catch (e: any) {
                    console.error(e);
                    new Notice(e.message);
                    return false;
                }
            },

            firstDay: this.plugin.settings.firstDay,
            initialView: this.plugin.settings.initialView,
            timeFormat24h: this.plugin.settings.timeFormat24h,
            openContextMenuForEvent: async (e, mouseEvent) => {
                const menu = new Menu();
                if (!this.plugin.cache) {
                    return;
                }
                const event = this.plugin.cache.getEventById(e.id);
                if (!event) {
                    return;
                }

                if (this.plugin.cache.isEventEditable(e.id)) {
                    if (!isTask(event)) {
                        menu.addItem((item) =>
                            item
                                .setTitle("Turn into task")
                                .onClick(async () => {
                                    await this.plugin.cache.processEvent(
                                        e.id,
                                        (e) => toggleTask(e, false)
                                    );
                                })
                        );
                    } else {
                        menu.addItem((item) =>
                            item
                                .setTitle("Remove checkbox")
                                .onClick(async () => {
                                    await this.plugin.cache.processEvent(
                                        e.id,
                                        unmakeTask
                                    );
                                })
                        );
                    }
                    menu.addSeparator();
                    menu.addItem((item) =>
                        item.setTitle("Go to note").onClick(() => {
                            if (!this.plugin.cache) {
                                return;
                            }
                            openFileForEvent(this.plugin.cache, this.app, e.id);
                        })
                    );
                    menu.addItem((item) =>
                        item.setTitle("Delete").onClick(async () => {
                            if (!this.plugin.cache) {
                                return;
                            }
                            await this.plugin.cache.deleteEvent(e.id);
                            new Notice(`Deleted event "${e.title}".`);
                        })
                    );
                } else {
                    menu.addItem((item) => {
                        item.setTitle(
                            "No actions available on remote events"
                        ).setDisabled(true);
                    });
                }

                menu.showAtMouseEvent(mouseEvent);
            },
            toggleTask: async (e, isDone) => {
                const event = this.plugin.cache.getEventById(e.id);
                if (!event) {
                    return false;
                }
                if (event.type !== "single") {
                    return false;
                }

                try {
                    await this.plugin.cache.updateEventWithId(
                        e.id,
                        toggleTask(event, isDone)
                    );
                } catch (e) {
                    if (e instanceof FCError) {
                        new Notice(e.message);
                    }
                    return false;
                }
                return true;
            },
        });
        // @ts-ignore
        window.fc = this.fullCalendarView;

        this.registerDomEvent(this.containerEl, "mouseenter", () => {
            this.plugin.cache.revalidateRemoteCalendars();
        });

        if (this.callback) {
            this.plugin.cache.off("update", this.callback);
            this.callback = null;
        }
        this.callback = this.plugin.cache.on("update", (payload) => {
            if (payload.type === "resync") {
                this.fullCalendarView?.removeAllEventSources();
                const sources = this.translateSources();
                sources.forEach((source) =>
                    this.fullCalendarView?.addEventSource(source)
                );
                return;
            } else if (payload.type === "events") {
                const { toRemove, toAdd } = payload;
                console.debug("updating view from cache...", {
                    toRemove,
                    toAdd,
                });
                this.fullCalendarView?.batchRendering(() => {
                    toRemove.forEach((id) => {
                        let event = this.fullCalendarView?.getEventById(id);
                        while (event) {
                            console.debug(
                                "removing event",
                                event.toPlainObject()
                            );
                            event.remove();
                            event = this.fullCalendarView?.getEventById(id);
                        }
                    });
                    toAdd.forEach(({ id, event, calendarId }) => {
                        const eventInput = toEventInput(id, event);
                        if (!eventInput) return;

                        // Double check if event already exists to prevent ghosts
                        let existingEvent =
                            this.fullCalendarView?.getEventById(id);
                        while (existingEvent) {
                            console.warn(
                                `Ghost event detected for ID ${id}, removing before re-add.`
                            );
                            existingEvent.remove();
                            existingEvent =
                                this.fullCalendarView?.getEventById(id);
                        }

                        console.debug("adding event", {
                            id,
                            event,
                            eventInput,
                            calendarId,
                        });
                        this.fullCalendarView?.addEvent(eventInput, calendarId);
                    });
                });
            } else if (payload.type == "calendar") {
                const {
                    calendar: { id, events, editable, color },
                } = payload;
                console.debug("replacing calendar with id", payload.calendar);
                this.fullCalendarView?.getEventSourceById(id)?.remove();
                this.fullCalendarView?.addEventSource({
                    id,
                    events: events.flatMap(
                        ({ id, event }) => toEventInput(id, event) || []
                    ),
                    editable,
                    ...getCalendarColors(color),
                });
            }
        });
    }

    onResize(): void {
        if (this.fullCalendarView) {
            this.fullCalendarView.render();
        }
    }

    private getScroller(): HTMLElement | null {
        const scroller = this.containerEl
            .querySelector(".fc-timegrid-body")
            ?.closest(".fc-scroller") as HTMLElement;
        if (!scroller) {
            console.warn("Full Calendar: TimeGrid scroller not found");
        }
        return scroller;
    }

    private getTimeOffset(scroller: HTMLElement): number {
        const slots = scroller.querySelector(
            ".fc-timegrid-slots"
        ) as HTMLElement;
        if (!slots) {
            console.warn(
                "Full Calendar: Slots NOT FOUND in scroller",
                scroller
            );
            return 0;
        }
        const totalHeight = slots.offsetHeight;
        const scrollTop = scroller.scrollTop;
        const viewportCenter = scrollTop + scroller.offsetHeight / 2;
        const offset = viewportCenter / totalHeight;
        console.log("Full Calendar: Offset Calc", {
            scrollTop,
            totalHeight,
            offset,
        });
        return offset;
    }

    private setTimeOffset(scroller: HTMLElement, offset: number) {
        // Always re-fetch the scroller from the container to avoid stale elements on mobile re-renders
        const activeScroller = this.getScroller();
        if (!activeScroller) return;

        const slots = activeScroller.querySelector(
            ".fc-timegrid-slots"
        ) as HTMLElement;
        if (!slots) return;
        const totalHeight = slots.offsetHeight;
        const viewportCenter = offset * totalHeight;
        activeScroller.scrollTop =
            viewportCenter - activeScroller.offsetHeight / 2;
    }

    private handleWheel = (e: WheelEvent) => {
        if (!e.ctrlKey || !this.fullCalendarView) return;
        const view = this.fullCalendarView.view;
        if (
            view.type !== "timeGridWeek" &&
            view.type !== "timeGridDay" &&
            view.type !== "timeGrid3Days"
        )
            return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const scroller = this.getScroller();
        if (!scroller) return;

        if (!this.isZooming) {
            this.isZooming = true;
            this.initialSlotHeight = this.plugin.settings.timeSlotHeight;
            this.currentZoomHeight = this.initialSlotHeight;
            this.zoomStartTimeOffset = this.getTimeOffset(scroller);
            console.log("Full Calendar: Zoom Start", this.zoomStartTimeOffset);
        }

        const zoomFactor = Math.pow(1.5, -e.deltaY / 100);
        this.currentZoomHeight = Math.min(
            Math.max(20, this.currentZoomHeight * zoomFactor),
            120
        );

        this.performZoom(this.currentZoomHeight, scroller);

        // Finalize after a short delay of no wheel events
        clearTimeout((this as any).zoomTimeout);
        (this as any).zoomTimeout = setTimeout(
            () => this.finalizeZoom(scroller),
            150
        );
    };

    private handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 2 || !this.fullCalendarView) return;
        const view = this.fullCalendarView.view;
        if (
            view.type !== "timeGridWeek" &&
            view.type !== "timeGridDay" &&
            view.type !== "timeGrid3Days"
        )
            return;

        const scroller = this.getScroller();
        if (!scroller) return;

        this.isZooming = true;
        this.initialSlotHeight = this.plugin.settings.timeSlotHeight;
        this.currentZoomHeight = this.initialSlotHeight;
        this.zoomStartTimeOffset = this.getTimeOffset(scroller);
        this.pinchStartDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        console.log(
            "Full Calendar: Touch Zoom Start",
            this.zoomStartTimeOffset
        );
    };

    private handleTouchMove = (e: TouchEvent) => {
        if (!this.isZooming || e.touches.length !== 2) return;
        e.preventDefault();

        const scroller = this.getScroller();
        if (!scroller) return;

        const dist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        const zoomFactor = dist / this.pinchStartDist;
        this.currentZoomHeight = Math.min(
            Math.max(20, this.initialSlotHeight * zoomFactor),
            120
        );

        this.performZoom(this.currentZoomHeight, scroller);
    };

    private handleTouchEnd = (e: TouchEvent) => {
        if (!this.isZooming) return;

        // If one finger is still down, don't finalize yet.
        // This prevents the "jump" when fingers are lifted at slightly different times.
        if (e.touches.length > 0) return;

        const scroller = this.getScroller();
        if (!scroller) {
            this.isZooming = false;
            return;
        }

        // Add a small delay to ensure the OS touch-system has settled
        clearTimeout((this as any).touchFinalizeTimeout);
        (this as any).touchFinalizeTimeout = setTimeout(() => {
            if (this.isZooming) {
                this.finalizeZoom(scroller);
            }
        }, 80);
    };

    private performZoom(newHeight: number, scroller: HTMLElement) {
        requestAnimationFrame(() => {
            const scale = newHeight / this.initialSlotHeight;
            this.containerEl.style.setProperty(
                "--zoom-scale",
                scale.toString()
            );
            this.containerEl.style.setProperty(
                "--fc-slot-min-height",
                `${newHeight}px`
            );
            this.setTimeOffset(scroller, this.zoomStartTimeOffset);
        });
    }

    private async finalizeZoom(scroller: HTMLElement) {
        if (!this.isZooming) return;
        const finalOffset = this.getTimeOffset(scroller);
        const finalHeight = this.currentZoomHeight;

        console.log("Full Calendar: FINALIZING", { finalHeight, finalOffset });

        // 1. Update the internal settings
        this.plugin.settings.timeSlotHeight = finalHeight;

        // 2. Clear the temporary transform and set the new physical height
        // We do this BEFORE calling FC updates so it measures the "clean" state.
        this.containerEl.style.setProperty("--zoom-scale", "1");
        this.containerEl.style.setProperty(
            "--fc-slot-min-height",
            `${finalHeight}px`
        );
        document.body.style.setProperty(
            "--fc-slot-min-height",
            `${finalHeight}px`
        );

        // 3. Force FullCalendar to recalculate its internal coordinate system
        if (this.fullCalendarView) {
            (this.fullCalendarView as any).setOption(
                "slotMinHeight",
                finalHeight
            );
        }

        // 4. Mobile Stabilization: Perform a triple-pass layout update.
        // We use a small delay between updates to ensure the DOM layout cache is invalidated.
        requestAnimationFrame(() => {
            if (this.fullCalendarView) {
                this.fullCalendarView.updateSize();
            }
            setTimeout(() => {
                requestAnimationFrame(async () => {
                    if (this.fullCalendarView) {
                        this.fullCalendarView.render();
                    }
                    this.setTimeOffset(scroller, finalOffset);
                    this.isZooming = false;
                    console.log("Full Calendar: Zoom Stabilized", finalOffset);
                    await this.plugin.saveSettings(true, true);
                });
            }, 50); // 50ms is enough for most mobile browsers to settle
        });
    }
    async onunload() {
        if (this.calendarEl) {
            this.calendarEl.removeEventListener("wheel", this.handleWheel);
            this.calendarEl.removeEventListener(
                "touchstart",
                this.handleTouchStart
            );
            this.calendarEl.removeEventListener(
                "touchmove",
                this.handleTouchMove
            );
            this.calendarEl.removeEventListener(
                "touchend",
                this.handleTouchEnd
            );
        }

        if (this.fullCalendarView) {
            this.fullCalendarView.destroy();
            this.fullCalendarView = null;
        }
        if (this.callback) {
            this.plugin.cache.off("update", this.callback);
            this.callback = null;
        }
    }
}
