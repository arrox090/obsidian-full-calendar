import { Notice } from "obsidian";
import * as React from "react";
import { SetStateAction, useState } from "react";

import { CalendarInfo } from "../../types";

type SourceWith<T extends Partial<CalendarInfo>, K> = T extends K ? T : never;

interface BasicProps<T extends Partial<CalendarInfo>> {
    source: T;
}

function DirectorySetting<T extends Partial<CalendarInfo>>({
    source,
}: BasicProps<T>) {
    let sourceWithDirectory = source as SourceWith<T, { directory: undefined }>;
    return (
        <div className="setting-item-control">
            <input
                disabled
                type="text"
                value={sourceWithDirectory.directory}
                style={{
                    width: "100%",
                    marginLeft: 4,
                    marginRight: 4,
                }}
            />
        </div>
    );
}

function HeadingSetting<T extends Partial<CalendarInfo>>({
    source,
}: BasicProps<T>) {
    let sourceWithHeading = source as SourceWith<T, { heading: undefined }>;
    return (
        <div
            className="setting-item-control"
            style={{ display: "block", textAlign: "center" }}
        >
            <span>Under heading</span>{" "}
            <input
                disabled
                type="text"
                value={sourceWithHeading.heading}
                style={{
                    marginLeft: 4,
                    marginRight: 4,
                }}
            />{" "}
            <span style={{ paddingRight: ".5rem" }}>in daily notes</span>
        </div>
    );
}

function UrlSetting<T extends Partial<CalendarInfo>>({
    source,
}: BasicProps<T>) {
    let sourceWithUrl = source as SourceWith<T, { url: undefined }>;
    return (
        <div className="setting-item-control">
            <input
                disabled
                type="text"
                value={sourceWithUrl.url}
                style={{
                    width: "100%",
                    marginLeft: 4,
                    marginRight: 4,
                }}
            />
        </div>
    );
}

function NameSetting<T extends Partial<CalendarInfo>>({
    source,
}: BasicProps<T>) {
    let sourceWithName = source as SourceWith<T, { name: undefined }>;
    return (
        <div className="setting-item-control">
            <input
                disabled
                type="text"
                value={sourceWithName.name}
                style={{
                    width: "100%",
                    marginLeft: 4,
                    marginRight: 4,
                }}
            />
        </div>
    );
}

function Username<T extends Partial<CalendarInfo>>({ source }: BasicProps<T>) {
    let sourceWithUsername = source as SourceWith<T, { username: undefined }>;
    return (
        <div className="setting-item-control">
            <input
                disabled
                type="text"
                value={sourceWithUsername.username}
                style={{
                    width: "100%",
                    marginLeft: 4,
                    marginRight: 4,
                }}
            />
        </div>
    );
}

interface CalendarSettingsProps {
    setting: Partial<CalendarInfo>;
    updateCalendar: (updates: Partial<CalendarInfo>) => void; // Changed from onColorChange
    deleteCalendar: () => void;
    availableHeadings: string[];
}

export const CalendarSettingRow = ({
    setting,
    updateCalendar,
    deleteCalendar,
    availableHeadings,
}: CalendarSettingsProps) => {
    const isCalDAV = setting.type === "caldav";
    const isDailyNote = setting.type === "dailynote";

    // Cast as any to bypass strict TS errors before you update schema.ts
    const isTaskByDefault = (setting as any).isTaskByDefault || false;
    const syncToDailyNote = (setting as any).syncToDailyNote || false;
    const dailyNoteFormat = (setting as any).dailyNoteFormat || "default";
    const dailyNoteHeading = (setting as any).dailyNoteHeading || "";

    return (
        <div
            className="setting-item"
            style={{
                flexDirection: "column",
                alignItems: "flex-start",
                borderBottom: "1px solid var(--background-modifier-border)",
                paddingBottom: "12px",
                marginBottom: "12px",
            }}
        >
            {/* TOP ROW: Standard Settings */}
            <div
                style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    marginBottom: "8px",
                }}
            >
                <button
                    type="button"
                    onClick={deleteCalendar}
                    style={{ maxWidth: "15%" }}
                >
                    ✕
                </button>
                {setting.type === "local" ? (
                    <DirectorySetting source={setting} />
                ) : isDailyNote ? (
                    <HeadingSetting source={setting} />
                ) : (
                    <UrlSetting source={setting} />
                )}
                {isCalDAV && <NameSetting source={setting} />}
                {isCalDAV && <Username source={setting} />}
                <input
                    style={{ maxWidth: "25%", minWidth: "3rem" }}
                    type="color"
                    value={setting.color}
                    onChange={(e) => updateCalendar({ color: e.target.value })}
                />
            </div>

            {/* BOTTOM ROW: Custom Integration Settings */}
            <div
                style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: "15px",
                    paddingLeft: "15%",
                }}
            >
                {/* 1. Auto-Select Task Notes */}
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        fontSize: "0.85em",
                        cursor: "pointer",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={isTaskByDefault}
                        onChange={(e) =>
                            updateCalendar({
                                isTaskByDefault: e.target.checked,
                            } as any)
                        }
                        style={{ marginRight: "6px" }}
                    />
                    Auto-select Task
                </label>

                {/* 2. Sync to Daily Note (Only show if it's NOT a daily note calendar already) */}
                {!isDailyNote && (
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: "0.85em",
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={syncToDailyNote}
                            onChange={(e) => {
                                const updates: any = {
                                    syncToDailyNote: e.target.checked,
                                };
                                if (
                                    e.target.checked &&
                                    !dailyNoteHeading &&
                                    availableHeadings.length > 0
                                ) {
                                    updates.dailyNoteHeading =
                                        availableHeadings[0];
                                }
                                updateCalendar(updates);
                            }}
                            style={{ marginRight: "6px" }}
                        />{" "}
                        Save to Daily Note
                    </label>
                )}

                {/* 3. Format Dropdown (Only show if Sync is checked) */}
                {!isDailyNote && syncToDailyNote && (
                    <>
                        <select
                            value={dailyNoteFormat}
                            onChange={(e) =>
                                updateCalendar({
                                    dailyNoteFormat: e.target.value,
                                } as any)
                            }
                            style={{ fontSize: "0.85em", padding: "2px 4px" }}
                        >
                            <option value="default">
                                Default Format (e.g. - [ ])
                            </option>
                            <option value="dayplanner">
                                Day Planner Format
                            </option>
                        </select>
                        <select
                            value={dailyNoteHeading}
                            onChange={(e) =>
                                updateCalendar({
                                    dailyNoteHeading: e.target.value,
                                } as any)
                            }
                            style={{ fontSize: "0.85em" }}
                        >
                            <option value="" disabled hidden>
                                Select Heading...
                            </option>
                            {availableHeadings.map((h: string) => (
                                <option key={h} value={h}>
                                    {h}
                                </option>
                            ))}
                        </select>
                    </>
                )}
            </div>
        </div>
    );
};

interface CalendarSettingProps {
    sources: CalendarInfo[];
    submit: (payload: CalendarInfo[]) => void;
    availableHeadings: string[];
}
type CalendarSettingState = {
    sources: CalendarInfo[];
    dirty: boolean;
};
export class CalendarSettings extends React.Component<
    CalendarSettingProps,
    CalendarSettingState
> {
    constructor(props: CalendarSettingProps) {
        super(props);
        this.state = { sources: props.sources, dirty: false };
    }

    addSource(source: CalendarInfo) {
        this.setState((state, props) => ({
            sources: [...state.sources, source],
            dirty: true,
        }));
    }

    render() {
        return (
            <div style={{ width: "100%" }}>
                {this.state.sources.map((s, idx) => (
                    <CalendarSettingRow
                        key={idx}
                        setting={s}
                        availableHeadings={this.props.availableHeadings}
                        updateCalendar={(updates: Partial<CalendarInfo>) =>
                            this.setState((state, props) => ({
                                sources: [
                                    ...state.sources.slice(0, idx),
                                    {
                                        ...state.sources[idx],
                                        ...updates,
                                    } as CalendarInfo,
                                    ...state.sources.slice(idx + 1),
                                ],
                                dirty: true,
                            }))
                        }
                        deleteCalendar={() =>
                            this.setState((state, props) => ({
                                sources: [
                                    ...state.sources.slice(0, idx),
                                    ...state.sources.slice(idx + 1),
                                ],
                                dirty: true,
                            }))
                        }
                    />
                ))}
                <div className="setting-item-control">
                    {this.state.dirty && (
                        <button
                            onClick={() => {
                                if (
                                    this.state.sources.filter(
                                        (s) => s.type === "dailynote"
                                    ).length > 1
                                ) {
                                    new Notice(
                                        "Only one daily note calendar is allowed."
                                    );
                                    return;
                                }
                                this.props.submit(
                                    this.state.sources.map(
                                        (elt) => elt as CalendarInfo
                                    )
                                );
                                this.setState({ dirty: false });
                            }}
                            style={{
                                backgroundColor: this.state.dirty
                                    ? "var(--interactive-accent)"
                                    : undefined,
                                color: this.state.dirty
                                    ? "var(--text-on-accent)"
                                    : undefined,
                            }}
                        >
                            {this.state.dirty ? "Save" : "Settings Saved"}
                        </button>
                    )}
                </div>
            </div>
        );
    }
}
