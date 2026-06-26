import ErrorBoundary from "@components/ErrorBoundary";
import { ScreenshareIcon } from "@components/Icons";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { openUserProfile } from "@utils/discord";
import { pluralise } from "@utils/misc";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ApplicationStreamingStore, ChannelActionCreators, ChannelRouter, ChannelStore, ContextMenuApi, FluxDispatcher, MediaEngineStore, Menu, Popout, SoundboardStore, Text, Tooltip, UserStore, useEffect, useMemo, useRef, useState, useStateFromStores, VoiceStateStore, SelectedChannelStore } from "@webpack/common";

import managedStyle from "./style.css?managed";

const cl = classNameFactory("vc-compact-voice-panel-");
const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");
const MediaEngineActions = findByPropsLazy("setLocalVolume", "setLocalMute");
const SpeakingStore = findByPropsLazy("isSpeaking");

type VoiceUser = {
    user: any;
    voiceState?: any;
    isStreaming: boolean;
    isSpeaking: boolean;
};

function VoiceIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
            <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" />
        </svg>
    );
}

function DisconnectButton() {
    return (
        <Tooltip text="Disconnect">
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={cl("icon-button", "disconnect")}
                    type="button"
                    title="Disconnect"
                    aria-label="Disconnect from voice"
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        (selectVoiceChannel as (channelId: string | null) => void)(null);
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="var(--status-danger)" d="M21.16 8.92c.5.5.84 1.17.84 1.88v2.4c0 .98-.8 1.8-1.8 1.8h-3.9c-.83 0-1.5-.67-1.5-1.5v-1.07a9.4 9.4 0 0 0-5.6 0v1.07c0 .83-.67 1.5-1.5 1.5H3.8c-1 0-1.8-.82-1.8-1.8v-2.4c0-.71.34-1.38.84-1.88 5.05-5.05 13.27-5.05 18.32 0Z" />
                    </svg>
                </button>
            )}
        </Tooltip>
    );
}

function clickDiscordScreenShareButton() {
    const controls = document.querySelectorAll<HTMLElement>("button,[role='button']");

    for (const control of controls) {
        if (control.closest(`.${cl("popout")}`)) continue;

        const label = [
            control.getAttribute("aria-label"),
            control.getAttribute("title"),
            control.textContent,
            control.className
        ].filter(Boolean).join(" ");

        if (/\b(screen|screenshare|screen share|go live|share your screen)\b/i.test(label)) {
            control.click();
            return true;
        }
    }

    const nativeScreenShareIcon = [...document.querySelectorAll<SVGElement>("svg")]
        .find(svg => !svg.closest(`.${cl("popout")}`) && svg.querySelector("path[d*='13.2 14.3375']"));
    const clickableParent = nativeScreenShareIcon?.closest<HTMLElement>("button,[role='button']");

    if (clickableParent) {
        clickableParent.click();
        return true;
    }

    return false;
}

function ScreenShareButton({ voiceChannelId }: { voiceChannelId: string; }) {
    return (
        <Tooltip text="Share Screen">
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={cl("icon-button", "screenshare")}
                    type="button"
                    aria-label="Share Screen"
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();

                        ChannelRouter.transitionToChannel(voiceChannelId);
                        window.setTimeout(clickDiscordScreenShareButton, 50);
                    }}
                >
                    <ScreenshareIcon width={18} height={18} />
                </button>
            )}
        </Tooltip>
    );
}

function WidthToggleButton({ expanded, onToggle }: { expanded: boolean; onToggle(): void; }) {
    return (
        <Tooltip text={expanded ? "Shrink Voice Panel" : "Expand Voice Panel"}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    className={cl("width-toggle")}
                    type="button"
                    aria-label={expanded ? "Shrink voice panel" : "Expand voice panel"}
                    aria-pressed={expanded}
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggle();
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            d={expanded ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                        />
                    </svg>
                </button>
            )}
        </Tooltip>
    );
}

function getAvatarUrl(user: any, size = 48) {
    return user.getAvatarURL?.(void 0, size, false)
        ?? user.getAvatarURL?.(void 0, size)
        ?? "";
}

function isUserStreaming(userId: string, voiceState?: any) {
    return Boolean(voiceState?.selfStream || voiceState?.stream || ApplicationStreamingStore.getAnyStreamForUser(userId));
}

function isUserSpeaking(userId: string) {
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    try {
        return Boolean(
            SpeakingStore.isSpeaking?.(userId)
            ?? (MediaEngineStore as any).isSpeaking?.(userId)
            ?? mediaEngine?.isSpeaking?.(userId)
            ?? mediaEngine?.getSpeakingFlags?.(userId)
        );
    } catch {
        return false;
    }
}

function getVoiceChannelName(channel: ReturnType<typeof ChannelStore.getChannel> | undefined) {
    if (!channel) return "Voice Connected";
    if (channel.name) return channel.name;
    if (channel.isDM?.()) return "Direct Call";
    if (channel.isGroupDM?.() || channel.isMultiUserDM?.()) return "Group Call";
    return "Voice Connected";
}

function getPrivateCallUsers(channel: ReturnType<typeof ChannelStore.getChannel> | undefined) {
    if (!channel?.isPrivate?.()) return [];

    const currentUserId = UserStore.getCurrentUser()?.id;
    return (channel.recipients ?? [])
        .filter(userId => userId !== currentUserId)
        .map(userId => UserStore.getUser(userId))
        .filter(Boolean);
}

function getLocalVolume(userId: string) {
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    return mediaEngine?.getLocalVolume?.(userId)
        ?? MediaEngineStore.getLocalVolume(userId)
        ?? 100;
}

function isLocalMuted(userId: string) {
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    return Boolean(
        MediaEngineStore.isLocalMute(userId)
        ?? mediaEngine?.isLocalMute?.(userId)
    );
}

function toggleLocalMute(userId: string) {
    const nextMuted = !isLocalMuted(userId);
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    try {
        MediaEngineActions.setLocalMute?.(userId, nextMuted);
    } catch {
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_LOCAL_MUTE", userId });
    }

    mediaEngine?.setLocalMute?.(userId, nextMuted);
}

function isSoundboardMuted(userId: string) {
    return Boolean(SoundboardStore.isLocalSoundboardMuted?.(userId));
}

function toggleSoundboardMute(userId: string) {
    FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_LOCAL_SOUNDBOARD_MUTE", userId });
}

function openDirectMessage(userId: string) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId || userId === currentUserId) return;

    const existingChannelId = ChannelStore.getDMFromUserId(userId);
    if (existingChannelId) {
        ChannelRouter.transitionToChannel(existingChannelId);
        return;
    }

    ChannelActionCreators.openPrivateChannel(currentUserId, userId);

    let attempts = 0;
    const intervalId = window.setInterval(() => {
        const channelId = ChannelStore.getDMFromUserId(userId);
        attempts++;

        if (!channelId && attempts < 10) return;

        window.clearInterval(intervalId);
        if (channelId) ChannelRouter.transitionToChannel(channelId);
    }, 100);
}

const setLocalVolume = debounce((userId: string, volume: number) => {
    const roundedVolume = Math.round(volume);
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    MediaEngineActions.setLocalVolume(userId, roundedVolume);
    mediaEngine?.setLocalVolume?.(userId, roundedVolume);
}, 75);

function VoiceUserContextMenu({ user, onClose }: { user: any; onClose(): void; }) {
    const volume = useStateFromStores(
        [MediaEngineStore],
        () => getLocalVolume(user.id)
    );
    const muted = useStateFromStores(
        [MediaEngineStore],
        () => isLocalMuted(user.id)
    );
    const soundboardMuted = useStateFromStores(
        [SoundboardStore],
        () => isSoundboardMuted(user.id)
    );
    const displayName = user.globalName ?? user.displayName ?? user.username;

    return (
        <Menu.Menu
            navId="vc-compact-voice-panel-user-context"
            onClose={() => {
                onClose();
            }}
            aria-label={`${user.username} Voice Menu`}
        >
            <Menu.MenuGroup>
                <Menu.MenuCheckboxItem
                    id="vc-compact-voice-panel-user-mute"
                    label="Mute"
                    checked={muted}
                    action={() => toggleLocalMute(user.id)}
                />
                <Menu.MenuCheckboxItem
                    id="vc-compact-voice-panel-user-soundboard-mute"
                    label="Mute Soundboard"
                    checked={soundboardMuted}
                    action={() => toggleSoundboardMute(user.id)}
                />
                <Menu.MenuItem
                    id="vc-compact-voice-panel-user-message"
                    label="Message"
                    action={() => openDirectMessage(user.id)}
                />
            </Menu.MenuGroup>
            <Menu.MenuSeparator />
            <Menu.MenuGroup>
                <Menu.MenuControlItem
                    id="vc-compact-voice-panel-user-volume"
                    label={`${displayName} Volume`}
                    control={(props, ref) => (
                        <Menu.MenuSliderControl
                            {...props}
                            ref={ref}
                            value={volume}
                            minValue={0}
                            maxValue={200}
                            onChange={(value: number) => setLocalVolume(user.id, value)}
                            renderValue={(value: number) => `${Math.round(value)}%`}
                        />
                    )}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

function VoiceMemberButton({ voiceUser, compact = false, onVolumeMenuOpen, onVolumeMenuClose }: {
    voiceUser: VoiceUser;
    compact?: boolean;
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    const { user, isStreaming, isSpeaking } = voiceUser;
    const name = user.globalName ?? user.displayName ?? user.username;
    const username = user.username ? `@${user.username}` : "";
    const tooltipText = (
        <span className={cl("member-tooltip")}>
            <span className={cl("member-tooltip-name")}>{name}</span>
            <span className={cl("member-tooltip-username")}>{username}</span>
            {isStreaming && <span className={cl("member-tooltip-live")}>Streaming</span>}
        </span>
    );

    function openVolumeMenu(event: React.MouseEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        onVolumeMenuOpen();

        const menuEvent = Object.create(event);
        Object.defineProperties(menuEvent, {
            clientY: { value: Math.max(8, event.clientY - 170) },
            pageY: { value: Math.max(8, event.pageY - 170) }
        });

        ContextMenuApi.openContextMenu(menuEvent, () => <VoiceUserContextMenu user={user} onClose={onVolumeMenuClose} />);
    }

    function openProfile(event: React.MouseEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        openUserProfile(user.id);
    }

    return (
        <Tooltip text={tooltipText}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    type="button"
                    className={cl("member", { compact, speaking: isSpeaking })}
                    aria-label={`${name}. Right click to adjust volume.`}
                    onClick={openProfile}
                    onContextMenu={openVolumeMenu}
                >
                    <span className={cl("member-avatar-wrap")}>
                        <img
                            className={cl("member-avatar")}
                            src={getAvatarUrl(user, compact ? 24 : 48)}
                            alt=""
                        />
                        {isStreaming && <span className={cl("live-badge")}>LIVE</span>}
                    </span>
                </button>
            )}
        </Tooltip>
    );
}

function VoiceAvatarStrip({ voiceUsers, expanded, onVolumeMenuOpen, onVolumeMenuClose }: {
    voiceUsers: VoiceUser[];
    expanded: boolean;
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    if (!voiceUsers.length) return null;

    const visibleUsers = voiceUsers.slice(0, expanded ? 8 : 3);
    const hiddenCount = voiceUsers.length - visibleUsers.length;
    const overflowUser = hiddenCount > 0 ? voiceUsers[visibleUsers.length] : undefined;

    return (
        <div className={cl("avatars")} onClick={event => event.stopPropagation()}>
            <div className={cl("avatar-strip")}>
                {visibleUsers.map(voiceUser => (
                    <VoiceMemberButton
                        key={voiceUser.user.id}
                        voiceUser={voiceUser}
                        compact
                        onVolumeMenuOpen={onVolumeMenuOpen}
                        onVolumeMenuClose={onVolumeMenuClose}
                    />
                ))}
                {overflowUser && (
                    <span className={cl("overflow-avatar")} aria-label={`${hiddenCount} more voice users`}>
                        <img
                            className={cl("overflow-avatar-image")}
                            src={getAvatarUrl(overflowUser.user, 24)}
                            alt=""
                        />
                        <span className={cl("overflow-count")}>+{hiddenCount}</span>
                    </span>
                )}
            </div>
        </div>
    );
}

function VoiceMemberList({ voiceUsers, onVolumeMenuOpen, onVolumeMenuClose }: {
    voiceUsers: VoiceUser[];
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
        const element = event.currentTarget;
        if (element.scrollWidth <= element.clientWidth) return;

        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX;

        if (!delta) return;

        event.preventDefault();
        event.stopPropagation();
        element.scrollLeft += delta;
    }

    if (!voiceUsers.length) {
        return (
            <Text variant="text-xs/normal" className={cl("empty")}>
                No voice users found
            </Text>
        );
    }

    return (
        <div className={cl("member-grid")} onWheel={handleWheel}>
            {voiceUsers.map(voiceUser => (
                <VoiceMemberButton
                    key={voiceUser.user.id}
                    voiceUser={voiceUser}
                    onVolumeMenuOpen={onVolumeMenuOpen}
                    onVolumeMenuClose={onVolumeMenuClose}
                />
            ))}
        </div>
    );
}

function VoiceUsersPopout({ channelName, voiceChannelId, voiceUsers, count, onMouseEnter, onMouseLeave, onVolumeMenuOpen, onVolumeMenuClose }: {
    channelName: string;
    voiceChannelId: string;
    voiceUsers: VoiceUser[];
    count: number;
    onMouseEnter(): void;
    onMouseLeave(): void;
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    return (
        <div
            className={cl("popout")}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className={cl("popout-header")}>
                <div className={cl("popout-copy")}>
                    <Text variant="text-sm/bold" className={cl("popout-title")}>{channelName}</Text>
                    <Text variant="text-xs/normal" className={cl("popout-subtitle")}>{pluralise(count, "user")} connected</Text>
                </div>
                <ScreenShareButton voiceChannelId={voiceChannelId} />
            </div>
            <div className={cl("members")}>
                <VoiceMemberList
                    voiceUsers={voiceUsers}
                    onVolumeMenuOpen={onVolumeMenuOpen}
                    onVolumeMenuClose={onVolumeMenuClose}
                />
            </div>
        </div>
    );
}

function CompactVoicePanel() {
    const targetRef = useRef<HTMLDivElement>(null);
    const closeTimerRef = useRef<number | undefined>(undefined);
    const hoveringRef = useRef(false);
    const volumeMenuOpenRef = useRef(false);
    const lastSpokeAtRef = useRef(new Map<string, number>());
    const speakingRef = useRef(new Map<string, boolean>());
    const [showPopout, setShowPopout] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [speakingKey, setSpeakingKey] = useState("");

    const voiceChannelId = useStateFromStores(
        [SelectedChannelStore],
        () => SelectedChannelStore.getVoiceChannelId()
    );

    const voiceStateKey = useStateFromStores(
        [VoiceStateStore, MediaEngineStore],
        () => {
            if (!voiceChannelId) return "";

            const states = VoiceStateStore.getVoiceStatesForChannel(voiceChannelId) ?? {};
            return Object.values(states)
                .map((voiceState: any) => [
                    voiceState.userId,
                    voiceState.selfStream ? "1" : "0",
                    voiceState.stream ? "1" : "0",
                    isUserSpeaking(voiceState.userId) ? "1" : "0"
                ].join(":"))
                .sort()
                .join("|");
        }
    );

    const activeStreamKey = useStateFromStores(
        [ApplicationStreamingStore],
        () => ApplicationStreamingStore.getAllActiveStreams()
            .map((stream: any) => stream.ownerId ?? stream.streamKey ?? stream.id)
            .join("|")
    );

    const channel = voiceChannelId ? ChannelStore.getChannel(voiceChannelId) : undefined;
    const voiceStates = voiceChannelId ? VoiceStateStore.getVoiceStatesForChannel(voiceChannelId) ?? {} : {};

    useEffect(() => {
        if (!voiceChannelId) return;
        const channelId = voiceChannelId;

        function readSpeakingKey() {
            const states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
            return Object.values(states)
                .filter((voiceState: any) => isUserSpeaking(voiceState.userId))
                .map((voiceState: any) => voiceState.userId)
                .sort()
                .join("|");
        }

        let previousKey = readSpeakingKey();
        setSpeakingKey(previousKey);

        const intervalId = window.setInterval(() => {
            const nextKey = readSpeakingKey();
            if (nextKey === previousKey) return;

            previousKey = nextKey;
            setSpeakingKey(nextKey);
        }, 50);

        return () => window.clearInterval(intervalId);
    }, [voiceChannelId]);

    const voiceUsers = useMemo(
        () => {
            const userMap = new Map<string, VoiceUser>();

            for (const voiceState of Object.values(voiceStates)) {
                const user = UserStore.getUser(voiceState.userId);
                if (user) {
                    userMap.set(user.id, {
                        user,
                        voiceState,
                        isStreaming: isUserStreaming(user.id, voiceState),
                        isSpeaking: isUserSpeaking(user.id)
                    });
                }
            }

            for (const user of getPrivateCallUsers(channel)) {
                const voiceState = VoiceStateStore.getVoiceStateForUser(user.id);
                userMap.set(user.id, {
                    user,
                    voiceState,
                    isStreaming: isUserStreaming(user.id, voiceState),
                    isSpeaking: isUserSpeaking(user.id)
                });
            }

            const users = [...userMap.values()];
            const now = Date.now();

            for (const voiceUser of users) {
                const wasSpeaking = speakingRef.current.get(voiceUser.user.id) ?? false;

                if (voiceUser.isSpeaking && !wasSpeaking) {
                    lastSpokeAtRef.current.set(voiceUser.user.id, now);
                }

                speakingRef.current.set(voiceUser.user.id, voiceUser.isSpeaking);
            }

            return users.sort((first, second) => {
                const firstSpokeAt = lastSpokeAtRef.current.get(first.user.id) ?? 0;
                const secondSpokeAt = lastSpokeAtRef.current.get(second.user.id) ?? 0;

                if (firstSpokeAt !== secondSpokeAt) return secondSpokeAt - firstSpokeAt;
                if (first.isSpeaking !== second.isSpeaking) return first.isSpeaking ? -1 : 1;

                const firstName = first.user.globalName ?? first.user.displayName ?? first.user.username ?? "";
                const secondName = second.user.globalName ?? second.user.displayName ?? second.user.username ?? "";
                return firstName.localeCompare(secondName);
            });
        },
        [activeStreamKey, channel, speakingKey, voiceStateKey, voiceChannelId]
    );

    if (!voiceChannelId) return null;

    const channelName = getVoiceChannelName(channel);
    const userCount = voiceUsers.length || Object.keys(voiceStates).length;

    function clearCloseTimer() {
        if (closeTimerRef.current != null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = undefined;
        }
    }

    function openPopout() {
        hoveringRef.current = true;
        clearCloseTimer();
        setShowPopout(true);
    }

    function requestClose() {
        clearCloseTimer();
        if (hoveringRef.current || volumeMenuOpenRef.current) return;

        closeTimerRef.current = window.setTimeout(() => setShowPopout(false), 175);
    }

    function scheduleClose() {
        hoveringRef.current = false;
        requestClose();
    }

    function keepOpenForVolumeMenu() {
        hoveringRef.current = true;
        volumeMenuOpenRef.current = true;
        clearCloseTimer();
        setShowPopout(true);
    }

    function releaseVolumeMenu() {
        hoveringRef.current = false;
        volumeMenuOpenRef.current = false;
        requestClose();
    }

    return (
        <Popout
            position="top"
            align="left"
            spacing={8}
            animation={Popout.Animation.NONE}
            shouldShow={showPopout}
            onRequestClose={() => setShowPopout(false)}
            targetElementRef={targetRef}
            renderPopout={() => (
                <VoiceUsersPopout
                    channelName={channelName}
                    voiceChannelId={voiceChannelId}
                    voiceUsers={voiceUsers}
                    count={userCount}
                    onMouseEnter={openPopout}
                    onMouseLeave={scheduleClose}
                    onVolumeMenuOpen={keepOpenForVolumeMenu}
                    onVolumeMenuClose={releaseVolumeMenu}
                />
            )}
        >
            {(popoutProps, { isShown }) => (
                <div
                    {...popoutProps}
                    ref={targetRef}
                    className={cl("tile", { shown: isShown, expanded })}
                    role="button"
                    tabIndex={0}
                    aria-label={`Voice connected to ${channelName}`}
                    onMouseEnter={openPopout}
                    onMouseLeave={scheduleClose}
                    onClick={() => ChannelRouter.transitionToChannel(voiceChannelId)}
                >
                    <WidthToggleButton
                        expanded={expanded}
                        onToggle={() => setExpanded(value => !value)}
                    />
                    <div className={cl("voice-icon")}>
                        <VoiceIcon />
                    </div>
                    <div className={cl("text")}>
                        <span className={cl("status")}>Voice</span>
                        <span className={cl("channel")}>{channelName}</span>
                    </div>
                    <VoiceAvatarStrip
                        voiceUsers={voiceUsers}
                        expanded={expanded}
                        onVolumeMenuOpen={keepOpenForVolumeMenu}
                        onVolumeMenuClose={releaseVolumeMenu}
                    />
                    <span className={cl("count")}>{userCount}</span>
                    <DisconnectButton />
                </div>
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "CompactVoicePanel",
    description: "Replaces the large voice panel with a compact voice tile beside the account panel.",
    authors: [{ name: "Local", id: 0n }],
    enabledByDefault: true,
    managedStyle,
    requiresRestart: false,
    patches: [
        {
            find: ".DISPLAY_NAME_STYLES_COACHMARK)",
            replacement: {
                match: /children:\[(?=.{0,25}?accountContainerRef)/,
                replace: "children:[$self.CompactVoicePanel(),"
            }
        }
    ],
    CompactVoicePanel: ErrorBoundary.wrap(CompactVoicePanel, { noop: true }),
});
