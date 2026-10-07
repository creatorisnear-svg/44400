import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Field, Input, Notice, Select } from "./ui";

const SNOWFLAKE = /^\d{17,20}$/;
const GAME_BOT = /ka0s|kaos|clover/i;

interface Guild { id: string; name: string }
interface Channel { id: string; name: string; category: string | null }
interface Bot { id: string; name: string; count: number }

// Bot names seen in any channel, so a picked bot keeps its name while another channel loads.
const botNames = new Map<string, string>();

export interface WatchValue {
  serverId: string;
  channelId: string;
  cloverId: string;
}

function useChannels(serverId: string, enabled = true) {
  return useQuery<{ channels: Channel[] }>({
    queryKey: ["discord-channels", serverId],
    queryFn: () => apiFetch(`/api/discord/guilds/${serverId}/channels`),
    enabled: enabled && SNOWFLAKE.test(serverId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function ChannelOptions({ channels }: { channels: Channel[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const c of channels) {
      const key = c.category ?? "";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [channels]);
  return (
    <>
      {groups.map(([cat, list]) =>
        cat ? (
          <optgroup key={cat} label={cat}>
            {list.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </optgroup>
        ) : (
          list.map((c) => (
            <option key={c.id} value={c.id}>#{c.name}</option>
          ))
        ),
      )}
    </>
  );
}

/** Channel drop-down for one server, with an "unset" choice on top. */
export function ChannelSelect({
  serverId,
  value,
  onChange,
  emptyLabel,
}: {
  serverId: string;
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
}) {
  const channels = useChannels(serverId);
  const list = channels.data?.channels ?? [];
  const known = !value || list.some((c) => c.id === value);
  if (channels.isError || !SNOWFLAKE.test(serverId)) {
    return <Input inputMode="numeric" placeholder="Channel ID" value={value} onChange={(e) => onChange(e.target.value.trim())} />;
  }
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={channels.isLoading}>
      <option value="">{channels.isLoading ? "Loading channels…" : emptyLabel}</option>
      {!known && <option value={value}>Channel {value}</option>}
      <ChannelOptions channels={list} />
    </Select>
  );
}

/**
 * Server, channel and game bot, picked from what the first account can see.
 * Falls back to typed IDs when Discord can't be reached.
 */
export function WatchPicker({ value, onChange }: { value: WatchValue; onChange: (p: Partial<WatchValue>) => void }) {
  const [manual, setManual] = useState(false);

  const guilds = useQuery<{ account: string; guilds: Guild[] }>({
    queryKey: ["discord-guilds"],
    queryFn: () => apiFetch("/api/discord/guilds"),
    enabled: !manual,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const channels = useChannels(value.serverId, !manual);
  const bots = useQuery<{ bots: Bot[] }>({
    queryKey: ["discord-bots", value.channelId],
    queryFn: () => apiFetch(`/api/discord/channels/${value.channelId}/bots`),
    enabled: !manual && SNOWFLAKE.test(value.channelId),
    staleTime: 60_000,
    retry: false,
  });

  for (const b of bots.data?.bots ?? []) botNames.set(b.id, b.name);

  // Pick the game bot for them when it's clearly there.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (value.cloverId || !bots.data) return;
    const match = bots.data.bots.find((b) => GAME_BOT.test(b.name));
    if (match) {
      onChange({ cloverId: match.id });
      setAutoPicked(true);
    }
  }, [bots.data, value.cloverId, onChange]);

  const failed = guilds.error ?? channels.error ?? null;

  if (manual) {
    return (
      <div className="space-y-4">
        <Field label="Server ID" hint="In Discord: turn on Developer Mode, right-click the server, Copy Server ID.">
          <Input inputMode="numeric" value={value.serverId} onChange={(e) => onChange({ serverId: e.target.value.trim() })} />
        </Field>
        <Field label="Channel ID" hint="Right-click the channel the game bot posts nukes in, Copy Channel ID.">
          <Input inputMode="numeric" value={value.channelId} onChange={(e) => onChange({ channelId: e.target.value.trim() })} />
        </Field>
        <Field label="Game bot ID" hint="Optional. Right-click the bot, Copy User ID. Blank means any bot.">
          <Input inputMode="numeric" value={value.cloverId} onChange={(e) => onChange({ cloverId: e.target.value.trim() })} />
        </Field>
        <button type="button" className="text-[13px] text-fg-2 underline underline-offset-4 hover:text-fg" onClick={() => setManual(false)}>
          Pick from lists instead
        </button>
      </div>
    );
  }

  const guildList = guilds.data?.guilds ?? [];
  const channelList = channels.data?.channels ?? [];
  const botList = bots.data?.bots ?? [];
  const serverKnown = !value.serverId || guildList.some((g) => g.id === value.serverId);
  const channelKnown = !value.channelId || channelList.some((c) => c.id === value.channelId);
  const botKnown = !value.cloverId || botList.some((b) => b.id === value.cloverId);

  return (
    <div className="space-y-4">
      {failed && <Notice tone="bad">{(failed as Error).message}</Notice>}

      <Field
        label="Server"
        hint={guilds.data ? `The servers ${guilds.data.account} is in.` : undefined}
      >
        <Select
          value={value.serverId}
          disabled={guilds.isLoading || !!guilds.error}
          onChange={(e) => onChange({ serverId: e.target.value, channelId: "" })}
        >
          <option value="">{guilds.isLoading ? "Loading servers…" : "Choose a server"}</option>
          {!serverKnown && <option value={value.serverId}>Server {value.serverId}</option>}
          {guildList.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Nuke channel" hint="Where the game bot posts Nuclear Fallout.">
        <Select
          value={value.channelId}
          disabled={!value.serverId || channels.isLoading || !!channels.error}
          onChange={(e) => onChange({ channelId: e.target.value })}
        >
          <option value="">
            {!value.serverId ? "Choose a server first" : channels.isLoading ? "Loading channels…" : "Choose a channel"}
          </option>
          {!channelKnown && <option value={value.channelId}>Channel {value.channelId}</option>}
          <ChannelOptions channels={channelList} />
        </Select>
      </Field>

      <Field
        label="Game bot"
        hint={
          autoPicked && value.cloverId
            ? "Found it in the channel and picked it for you."
            : bots.data && botList.length === 0
              ? "No bot has posted there lately. Any bot works; Halo still checks the keywords."
              : "Only this bot's messages count as nukes."
        }
      >
        <Select
          value={value.cloverId}
          disabled={!value.channelId || bots.isLoading}
          onChange={(e) => {
            setAutoPicked(false);
            onChange({ cloverId: e.target.value });
          }}
        >
          <option value="">{bots.isLoading ? "Looking at recent messages…" : "Any bot"}</option>
          {!botKnown && <option value={value.cloverId}>{botNames.get(value.cloverId) ?? `Bot ${value.cloverId}`}</option>}
          {botList.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.count} recent message{b.count === 1 ? "" : "s"})
            </option>
          ))}
        </Select>
      </Field>

      <button type="button" className="text-[13px] text-fg-2 underline underline-offset-4 hover:text-fg" onClick={() => setManual(true)}>
        Type the IDs instead
      </button>
    </div>
  );
}
