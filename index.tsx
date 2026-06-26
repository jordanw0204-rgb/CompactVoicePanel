import ErrorBoundary from "@components/ErrorBoundary";
import { ScreenshareIcon } from "@components/Icons";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { openUserProfile } from "@utils/discord";
import { pluralise } from "@utils/misc";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ApplicationStreamingStore, ChannelRouter, ChannelStore, ContextMenuApi, MediaEngineStore, Menu, Popout, Text, Tooltip, UserStore, useMemo, useRef, useState, useStateFromStores, VoiceStateStore, SelectedChannelStore } from "@webpack/common";

import managedStyle from "./style.css?managed";

const cl = classNameFactory("vc-compact-voice-panel-");
const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");
const MediaEngineActions = findByPropsLazy("setLocalVolume", "setLocalMute");

type VoiceUser = {
    user: any;
    voiceState?: any;
    isStreaming: boolean;
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
    const panels = document.querySelector<HTMLElement>("[class*='panels']");
    const buttons = panels?.querySelectorAll<HTMLElement>("button,[role='button']");
    if (!buttons) return false;

    for (const button of buttons) {
        if (button.closest(`.${cl("popout")}`)) continue;

        const label = [
            button.getAttribute("aria-label"),
            button.getAttribute("title"),
            button.textContent
        ].filter(Boolean).join(" ");

        if (/\b(screen|screenshare|screen share|go live|share your screen)\b/i.test(label)) {
            button.click();
            return true;
        }
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

                        if (!clickDiscordScreenShareButton()) {
                            ChannelRouter.transitionToChannel(voiceChannelId);
                        }
                    }}
                >
                    <ScreenshareIcon width={18} height={18} />
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

const setLocalVolume = debounce((userId: string, volume: number) => {
    const roundedVolume = Math.round(volume);
    const mediaEngine = MediaEngineStore.getMediaEngine?.() as any;

    MediaEngineActions.setLocalVolume(userId, roundedVolume);
    mediaEngine?.setLocalVolume?.(userId, roundedVolume);
}, 75);

function VoiceUserVolumeMenu({ user, onClose }: { user: any; onClose(): void; }) {
    const volume = useStateFromStores(
        [MediaEngineStore],
        () => getLocalVolume(user.id)
    );
    const displayName = user.globalName ?? user.displayName ?? user.username;

    return (
        <Menu.Menu
            navId="vc-compact-voice-panel-volume"
            onClose={() => {
                onClose();
            }}
            aria-label={`${user.username} Voice Menu`}
        >
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
    const { user, isStreaming } = voiceUser;
    const name = user.globalName ?? user.displayName ?? user.username;
    const username = user.username ? `@${user.username}` : "";

    function openVolumeMenu(event: React.MouseEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        onVolumeMenuOpen();
        ContextMenuApi.openContextMenu(event, () => <VoiceUserVolumeMenu user={user} onClose={onVolumeMenuClose} />);
    }

    function openProfile(event: React.MouseEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        openUserProfile(user.id);
    }

    return (
        <Tooltip text={isStreaming ? `${name} is streaming` : name}>
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    type="button"
                    className={cl("member", { compact })}
                    aria-label={`${name}. Right click to adjust volume.`}
                    onClick={openProfile}
                    onContextMenu={openVolumeMenu}
                >
                    {!compact && (
                        <span className={cl("member-label")}>
                            <span className={cl("member-name")}>{name}</span>
                            <span className={cl("member-username")}>{username}</span>
                        </span>
                    )}
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

function VoiceAvatarStrip({ voiceUsers, onVolumeMenuOpen, onVolumeMenuClose }: {
    voiceUsers: VoiceUser[];
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    if (!voiceUsers.length) return null;

    const visibleUsers = voiceUsers.slice(0, 3);
    const hiddenCount = voiceUsers.length - visibleUsers.length;

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
                {hiddenCount > 0 && <span className={cl("overflow-count")}>+{hiddenCount}</span>}
            </div>
        </div>
    );
}

function VoiceMemberList({ voiceUsers, onVolumeMenuOpen, onVolumeMenuClose }: {
    voiceUsers: VoiceUser[];
    onVolumeMenuOpen(): void;
    onVolumeMenuClose(): void;
}) {
    if (!voiceUsers.length) {
        return (
            <Text variant="text-xs/normal" className={cl("empty")}>
                No voice users found
            </Text>
        );
    }

    return (
        <div className={cl("member-grid")}>
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
    const [showPopout, setShowPopout] = useState(false);

    const voiceChannelId = useStateFromStores(
        [SelectedChannelStore],
        () => SelectedChannelStore.getVoiceChannelId()
    );

    const voiceStateKey = useStateFromStores(
        [VoiceStateStore],
        () => {
            if (!voiceChannelId) return "";

            const states = VoiceStateStore.getVoiceStatesForChannel(voiceChannelId) ?? {};
            return Object.values(states)
                .map((voiceState: any) => [
                    voiceState.userId,
                    voiceState.selfStream ? "1" : "0",
                    voiceState.stream ? "1" : "0"
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
    const voiceUsers = useMemo(
        () => {
            const userMap = new Map<string, VoiceUser>();

            for (const voiceState of Object.values(voiceStates)) {
                const user = UserStore.getUser(voiceState.userId);
                if (user) {
                    userMap.set(user.id, {
                        user,
                        voiceState,
                        isStreaming: isUserStreaming(user.id, voiceState)
                    });
                }
            }

            for (const user of getPrivateCallUsers(channel)) {
                const voiceState = VoiceStateStore.getVoiceStateForUser(user.id);
                userMap.set(user.id, {
                    user,
                    voiceState,
                    isStreaming: isUserStreaming(user.id, voiceState)
                });
            }

            return [...userMap.values()];
        },
        [activeStreamKey, channel, voiceStateKey, voiceChannelId]
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
                    className={cl("tile", { shown: isShown })}
                    role="button"
                    tabIndex={0}
                    aria-label={`Voice connected to ${channelName}`}
                    onMouseEnter={openPopout}
                    onMouseLeave={scheduleClose}
                    onClick={() => ChannelRouter.transitionToChannel(voiceChannelId)}
                >
                    <div className={cl("voice-icon")}>
                        <VoiceIcon />
                    </div>
                    <div className={cl("text")}>
                        <span className={cl("status")}>Voice</span>
                        <span className={cl("channel")}>{channelName}</span>
                    </div>
                    <VoiceAvatarStrip
                        voiceUsers={voiceUsers}
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
