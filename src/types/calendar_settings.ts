import { ZodError, z } from "zod";
import { OFCEvent } from "./schema";

const calendarOptionsSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("local"), directory: z.string() }),
    z.object({ type: z.literal("dailynote"), heading: z.string() }),
    z.object({ type: z.literal("ical"), url: z.string().url() }),
    z.object({
        type: z.literal("caldav"),
        name: z.string(),
        url: z.string().url(),
        homeUrl: z.string().url(),
        username: z.string(),
        password: z.string(),
    }),
]);

const colorValidator = z.object({ color: z.string() });

// 1. Define the new Integration Settings Schema
const integrationValidator = z.object({
    isTaskByDefault: z.boolean().optional(),
    syncToDailyNote: z.boolean().optional(),
    dailyNoteFormat: z.enum(["default", "dayplanner"]).optional(),
    dailyNoteHeading: z.string().optional(),
});

export type TestSource = {
    type: "FOR_TEST_ONLY";
    id: string;
    events?: OFCEvent[];
};

// 2. Merge the Integration Settings into the CalendarInfo type
export type CalendarInfo = (
    | z.infer<typeof calendarOptionsSchema>
    | TestSource
) &
    z.infer<typeof colorValidator> &
    z.infer<typeof integrationValidator>;

export function parseCalendarInfo(obj: unknown): CalendarInfo {
    const options = calendarOptionsSchema.parse(obj);
    const color = colorValidator.parse(obj);
    // 3. Parse the new integration settings
    const integration = integrationValidator.parse(obj);

    // 4. Return everything combined
    return { ...options, ...color, ...integration };
}

export function safeParseCalendarInfo(obj: unknown): CalendarInfo | null {
    try {
        return parseCalendarInfo(obj);
    } catch (e) {
        if (e instanceof ZodError) {
            console.debug("Parsing calendar info failed with errors", {
                obj,
                error: e.message,
            });
        }
        return null;
    }
}

/**
 * Construct a partial calendar source of the specified type
 */
export function makeDefaultPartialCalendarSource(
    type: CalendarInfo["type"] | "icloud"
): Partial<CalendarInfo> {
    if (type === "icloud") {
        return {
            type: "caldav",
            color: getComputedStyle(document.body)
                .getPropertyValue("--interactive-accent")
                .trim(),
            url: "https://caldav.icloud.com",
            isTaskByDefault: false, // Set defaults
            syncToDailyNote: false,
            dailyNoteFormat: "default",
        };
    }

    return {
        type: type,
        color: getComputedStyle(document.body)
            .getPropertyValue("--interactive-accent")
            .trim(),
        isTaskByDefault: false, // Set defaults
        syncToDailyNote: false,
        dailyNoteFormat: "default",
    };
}
