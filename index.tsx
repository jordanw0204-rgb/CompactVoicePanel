import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { pluralise } from "@utils/misc";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelRouter, ChannelStore, Popout, Text, Tooltip, UserStore, UserSummaryItem, useMemo, useRef, useState, useStateFromStores, VoiceStateStore, SelectedChannelStore } from "@webpack/common";

import managedStyle from "./style.css?managed";

const cl = classNameFactory("vc-compact-voice-panel-");
const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");

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

function VoiceAvatarStrip({ users }: { users: any[]; }) {
    if (!users.length) return null;

    return (
        <div className={cl("avatars")} onClick={event => event.stopPropagation()}>
            <UserSummaryItem
                users={users}
                renderIcon={false}
                max={3}
                size={20}
                showUserPopout
            />
        </div>
    );
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

function VoiceUsersPopout({ channelName, users, count, onMouseEnter, onMouseLeave }: {
    channelName: string;
    users: any[];
    count: number;
    onMouseEnter(): void;
    onMouseLeave(): void;
}) {
    return (
        <div
            className={cl("popout")}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <Text variant="text-sm/bold" className={cl("popout-title")}>{channelName}</Text>
            <Text variant="text-xs/normal" className={cl("popout-subtitle")}>{pluralise(count, "user")} connected</Text>
            <div className={cl("members")}>
                <UserSummaryItem
                    users={users}
                    renderIcon={false}
                    max={12}
                    size={28}
                    showUserPopout
                />
            </div>
        </div>
    );
}

function CompactVoicePanel() {
    const targetRef = useRef<HTMLDivElement>(null);
    const closeTimerRef = useRef<number | undefined>(undefined);
    const [showPopout, setShowPopout] = useState(false);

    const voiceChannelId = useStateFromStores(
        [SelectedChannelStore],
        () => SelectedChannelStore.getVoiceChannelId()
    );

    const voiceStates = useStateFromStores(
        [VoiceStateStore],
        () => voiceChannelId ? VoiceStateStore.getVoiceStatesForChannel(voiceChannelId) : {}
    );

    const channel = voiceChannelId ? ChannelStore.getChannel(voiceChannelId) : undefined;
    const users = useMemo(
        () => {
            const userMap = new Map<string, any>();

            for (const voiceState of Object.values(voiceStates)) {
                const user = UserStore.getUser(voiceState.userId);
                if (user) userMap.set(user.id, user);
            }

            for (const user of getPrivateCallUsers(channel)) {
                userMap.set(user.id, user);
            }

            return [...userMap.values()];
        },
        [channel, voiceStates]
    );

    if (!voiceChannelId) return null;

    const channelName = getVoiceChannelName(channel);
    const userCount = users.length || Object.keys(voiceStates).length;

    function clearCloseTimer() {
        if (closeTimerRef.current != null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = undefined;
        }
    }

    function openPopout() {
        clearCloseTimer();
        setShowPopout(true);
    }

    function scheduleClose() {
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(() => setShowPopout(false), 175);
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
                    users={users}
                    count={userCount}
                    onMouseEnter={openPopout}
                    onMouseLeave={scheduleClose}
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
                    <VoiceAvatarStrip users={users} />
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
