import { App, TFile } from "obsidian";
import {
    getDailyNote,
    getAllDailyNotes,
} from "obsidian-daily-notes-interface";
import { OFCEvent } from "../types";
import moment from "moment";

export const generateInlineAttributes = (
    attrs: Record<string, any>
): string => {
    return Object.entries(attrs)
        .map(([k, v]) => `[${k}:: ${v}]`)
        .join("  ");
};

export const makeListItem = (
    data: OFCEvent,
    whitespacePrefix: string = ""
): string => {
    if (data.type !== "single" && data.type !== "recurring") {
        throw new Error("Can only pass in single or recurring event.");
    }
    const { title } = data;
    const completed = (data as any).completed;
    const checkbox = (() => {
        if (completed !== null && completed !== undefined) {
            return `[${completed ? "x" : " "}]`;
        }
        return null;
    })();

    const attrs: Partial<OFCEvent> = { ...data };
    delete (attrs as any)["completed"];
    delete (attrs as any)["title"];
    delete (attrs as any)["type"];
    delete (attrs as any)["date"];
    delete (attrs as any)["instanceDate"];

    for (const key of <(keyof OFCEvent)[]>Object.keys(attrs)) {
        if (attrs[key] === undefined || attrs[key] === null) {
            delete attrs[key];
        }
    }

    if (!attrs["allDay"]) {
        delete attrs["allDay"];
    }

    return `${whitespacePrefix}- ${
        checkbox || ""
    } ${title} ${generateInlineAttributes(attrs)}`.trim();
};

export function getTaskLine(
    event: OFCEvent,
    format: "default" | "dayplanner" = "default"
): string {
    if (format === "dayplanner" && !event.allDay) {
        return `- [ ] ${event.startTime}-${event.endTime} ${event.title}`;
    } else {
        return makeListItem(event);
    }
}

function matchesTask(
    line: string,
    event: OFCEvent,
    format: "default" | "dayplanner"
): boolean {
    const trimmed = line.trim();
    const expected = getTaskLine(event, format).trim();
    // 1:1 exact match to avoid any mistakes
    return trimmed === expected;
}

export async function appendTaskToDailyNote(
    app: App,
    event: OFCEvent,
    format: "default" | "dayplanner" = "default",
    headingText?: string
) {
    let dateStr = "";
    if (event.type === "single") {
        dateStr = event.date;
    } else if (event.type === "recurring") {
        dateStr = (event as any).instanceDate || event.startRecur || "";
    } else if (event.type === "rrule") {
        dateStr = event.startDate;
    }

    if (!dateStr) return;

    const date = moment(dateStr);
    const dailyNotes = getAllDailyNotes();
    let dailyNote = getDailyNote(date, dailyNotes) as TFile;

    if (!dailyNote) {
        return;
    }

    const taskLine = getTaskLine(event, format);

    let content = await app.vault.read(dailyNote as any);
    if (content.split("\n").some((l) => matchesTask(l, event, format))) {
        console.debug("Task already exists in daily note, skipping append.");
        return;
    }

    console.log(`Appending task "${event.title}" to ${dailyNote.path}`);

    if (headingText) {
        const cache = app.metadataCache.getFileCache(dailyNote as any);
        const heading = cache?.headings?.find(
            (h) => h.heading.trim() === headingText.trim()
        );
        let lines = content.split("\n");

        if (heading) {
            const insertAt = heading.position.start.line + 1;
            lines.splice(insertAt, 0, taskLine);
        } else {
            lines.push(`\n## ${headingText}`);
            lines.push(taskLine);
        }
        await app.vault.modify(dailyNote as any, lines.join("\n"));
    } else {
        await app.vault.modify(dailyNote as any, content + "\n" + taskLine);
    }
}

export async function removeTaskFromDailyNote(
    app: App,
    event: OFCEvent,
    format: "default" | "dayplanner" = "default"
) {
    let dateStr = "";
    if (event.type === "single") {
        dateStr = event.date;
    } else if (event.type === "recurring") {
        dateStr = (event as any).instanceDate || event.startRecur || "";
    } else if (event.type === "rrule") {
        dateStr = event.startDate;
    }

    if (!dateStr) return;

    const date = moment(dateStr);
    const dailyNotes = getAllDailyNotes();
    const dailyNote = getDailyNote(date, dailyNotes) as TFile;

    if (!dailyNote) return;

    const content = await app.vault.read(dailyNote);
    const lines = content.split("\n");

    const filteredLines = lines.filter(
        (line) => !matchesTask(line, event, format)
    );

    if (lines.length !== filteredLines.length) {
        console.log(`Removing task "${event.title}" from ${dailyNote.path}`);
        await app.vault.modify(dailyNote, filteredLines.join("\n"));
    }
}

export async function updateTaskInDailyNote(
    app: App,
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    format: "default" | "dayplanner" = "default",
    headingText?: string
) {
    let oldDate = "";
    if (oldEvent.type === "single") oldDate = oldEvent.date;
    else if (oldEvent.type === "recurring")
        oldDate = (oldEvent as any).instanceDate || oldEvent.startRecur || "";

    let newDate = "";
    if (newEvent.type === "single") newDate = newEvent.date;
    else if (newEvent.type === "recurring")
        newDate = (newEvent as any).instanceDate || newEvent.startRecur || "";

    if (oldDate !== newDate) {
        console.log(`Date changed for "${oldEvent.title}", moving task.`);
        await removeTaskFromDailyNote(app, oldEvent, format);
        await appendTaskToDailyNote(app, newEvent, format, headingText);
    } else {
        const date = moment(newDate);
        const dailyNotes = getAllDailyNotes();
        const dailyNote = getDailyNote(date, dailyNotes) as TFile;
        if (!dailyNote) return;

        const newLine = getTaskLine(newEvent, format);

        const content = await app.vault.read(dailyNote);
        const lines = content.split("\n");
        const idx = lines.findIndex((l) => matchesTask(l, oldEvent, format));

        if (idx !== -1) {
            console.log(
                `Updating task "${oldEvent.title}" to "${newEvent.title}" in ${dailyNote.path}`
            );
            lines[idx] = newLine;
            await app.vault.modify(dailyNote, lines.join("\n"));
        } else {
            console.warn(
                `Could not find old task line for "${oldEvent.title}", appending new line instead.`
            );
            await appendTaskToDailyNote(app, newEvent, format, headingText);
        }
    }
}
