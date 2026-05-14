import { rrulestr, RRule } from "rrule";
import { parseRecurrence } from "./ui/interop";
import { DateTime } from "luxon";
import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import {
    CalendarView,
    FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
    FULL_CALENDAR_VIEW_TYPE,
} from "./ui/view";
import { renderCalendar } from "./ui/calendar";
import { toEventInput } from "./ui/interop";
import {
    DEFAULT_SETTINGS,
    FullCalendarSettings,
    FullCalendarSettingTab,
} from "./ui/settings";
import { PLUGIN_SLUG } from "./types";
import EventCache from "./core/EventCache";
import { ObsidianIO } from "./ObsidianAdapter";
import { launchCreateModal } from "./ui/event_modal";
import FullNoteCalendar from "./calendars/FullNoteCalendar";
import DailyNoteCalendar from "./calendars/DailyNoteCalendar";
import ICSCalendar from "./calendars/ICSCalendar";
import CalDAVCalendar from "./calendars/CalDAVCalendar";
import { appendTaskToDailyNote } from "./core/DailyNoteIntegration";
import { getDateFromFile } from "obsidian-daily-notes-interface";

export default class FullCalendarPlugin extends Plugin {
    settings: FullCalendarSettings = DEFAULT_SETTINGS;
    cache: EventCache = new EventCache(this.app, {
        local: (info) =>
            info.type === "local"
                ? new FullNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.directory
                  )
                : null,
        dailynote: (info) =>
            info.type === "dailynote"
                ? new DailyNoteCalendar(
                      new ObsidianIO(this.app),
                      info.color,
                      info.heading
                  )
                : null,
        ical: (info) =>
            info.type === "ical" ? new ICSCalendar(info.color, info.url) : null,
        caldav: (info) =>
            info.type === "caldav"
                ? new CalDAVCalendar(
                      info.color,
                      info.name,
                      {
                          type: "basic",
                          username: info.username,
                          password: info.password,
                      },
                      info.url,
                      info.homeUrl
                  )
                : null,
        FOR_TEST_ONLY: () => null,
    });

    renderCalendar = renderCalendar;
    processFrontmatter = toEventInput;

    async syncTasksToNewDailyNote(file: TFile) {
        const date = getDateFromFile(file as any, "day");
        if (!date) return;

        const dateStr = date.format("YYYY-MM-DD");
        const jsDate = date.toDate();
        const allEvents = this.cache.getAllEvents();

        // Wait a bit for the file to be fully written/cached by Obsidian
        await new Promise((resolve) => setTimeout(resolve, 500));

        for (const source of allEvents) {
            const calendarSource = this.settings.calendarSources.find(
                (s: any) => {
                    const [type, ...rest] = source.id.split("::");
                    const identifier = rest.join("::");
                    if (s.type !== type) return false;
                    if (s.type === "local") return s.directory === identifier;
                    if (s.type === "dailynote") return s.heading === identifier;
                    return false;
                }
            );

            if (calendarSource?.syncToDailyNote) {
                for (const cachedEvent of source.events) {
                    const { event } = cachedEvent;

                    let shouldSync = false;
                    let instanceDate = "";

                    if (event.type === "single") {
                        if (event.date === dateStr) {
                            shouldSync = true;
                            instanceDate = event.date;
                        }
                    } else if (event.type === "recurring") {
                        const parsed = parseRecurrence(event.recurrence);
                        if (parsed) {
                            const rrule = new RRule({
                                freq: parsed.freq,
                                interval: parsed.interval,
                                dtstart: DateTime.fromISO(
                                    event.startRecur || ""
                                ).toJSDate(),
                                until: event.endRecur
                                    ? DateTime.fromISO(
                                          event.endRecur
                                      ).toJSDate()
                                    : undefined,
                            });
                            if (
                                rrule.between(jsDate, jsDate, true).length > 0
                            ) {
                                shouldSync = true;
                                instanceDate = dateStr;
                            }
                        }
                    }

                    if (
                        shouldSync &&
                        (event as any).completed !== null &&
                        (event as any).completed !== undefined
                    ) {
                        const eventWithInstance = { ...event, instanceDate };
                        await appendTaskToDailyNote(
                            this.app,
                            eventWithInstance,
                            calendarSource.dailyNoteFormat,
                            calendarSource.dailyNoteHeading
                        );
                    }
                }
            }
        }
    }

    async activateView() {
        const leaves = this.app.workspace
            .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
            .filter((l) => (l.view as CalendarView).inSidebar === false);
        if (leaves.length === 0) {
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.setViewState({
                type: FULL_CALENDAR_VIEW_TYPE,
                active: true,
            });
        } else {
            await Promise.all(
                leaves.map((l) => (l.view as CalendarView).onOpen())
            );
        }
    }
    async onload() {
        await this.loadSettings();

        this.cache.reset(this.settings.calendarSources);

        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                this.cache.fileUpdated(file);
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (file instanceof TFile) {
                    console.debug("FILE RENAMED", oldPath, "->", file.path);
                    this.cache.fileMoved(oldPath, file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file instanceof TFile) {
                    console.debug("FILE DELETED", file.path);
                    this.cache.deleteEventsAtPath(file.path);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("create", (file) => {
                if (file instanceof TFile) {
                    this.syncTasksToNewDailyNote(file);
                }
            })
        );

        // @ts-ignore
        window.cache = this.cache;

        this.registerView(
            FULL_CALENDAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, false)
        );

        this.registerView(
            FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
            (leaf) => new CalendarView(leaf, this, true)
        );

        this.addRibbonIcon(
            "calendar-glyph",
            "Open Full Calendar",
            async (_: MouseEvent) => {
                await this.activateView();
            }
        );

        this.addSettingTab(new FullCalendarSettingTab(this.app, this));

        this.addCommand({
            id: "full-calendar-new-event",
            name: "New Event",
            callback: () => {
                launchCreateModal(this, {});
            },
        });

        this.addCommand({
            id: "full-calendar-reset",
            name: "Reset Event Cache",
            callback: () => {
                this.cache.reset(this.settings.calendarSources);
                this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
                this.app.workspace.detachLeavesOfType(
                    FULL_CALENDAR_SIDEBAR_VIEW_TYPE
                );
                new Notice("Full Calendar has been reset.");
            },
        });

        this.addCommand({
            id: "full-calendar-revalidate",
            name: "Revalidate remote calendars",
            callback: () => {
                this.cache.revalidateRemoteCalendars(true);
            },
        });

        this.addCommand({
            id: "full-calendar-open",
            name: "Open Calendar",
            callback: () => {
                this.activateView();
            },
        });

        this.addCommand({
            id: "full-calendar-open-sidebar",
            name: "Open in sidebar",
            callback: () => {
                if (
                    this.app.workspace.getLeavesOfType(
                        FULL_CALENDAR_SIDEBAR_VIEW_TYPE
                    ).length
                ) {
                    return;
                }
                this.app.workspace.getRightLeaf(false).setViewState({
                    type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
                });
            },
        });

        (this.app.workspace as any).registerHoverLinkSource(PLUGIN_SLUG, {
            display: "Full Calendar",
            defaultMod: true,
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings(skipReset = false, quiet = false) {
        if (!quiet) {
            new Notice("Resetting the event cache with new settings...");
        }
        await this.saveData(this.settings);
        if (skipReset) {
            return;
        }
        this.cache.reset(this.settings.calendarSources);
        await this.cache.populate();
        this.cache.resync();
    }
}
