import { GuildMember, PermissionFlagsBits } from "discord.js";
import type { KoesuClient } from "../client.js";

export async function isDJ(member: GuildMember, client: KoesuClient): Promise<boolean> {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const guild = await client.prisma.guild.findUnique({
    where: { id: member.guild.id },
  });

  if (!guild?.djRoleId) return true;
  return member.roles.cache.has(guild.djRoleId);
}

export async function isInVoice(member: GuildMember): Promise<boolean> {
  return !!member.voice.channel;
}

export async function isSameVoice(member: GuildMember, client: KoesuClient): Promise<boolean> {
  const player = client.lavalink.getPlayer(member.guild.id);
  if (!player) return true;
  return member.voice.channelId === player.voiceChannelId;
}

export async function canVoteSkip(
  member: GuildMember,
  client: KoesuClient
): Promise<{ can: boolean; current: number; required: number }> {
  const guild = await client.prisma.guild.findUnique({
    where: { id: member.guild.id },
  });

  const ratio = guild?.voteSkipRatio ?? 0.5;
  const player = client.lavalink.getPlayer(member.guild.id);

  if (!player) return { can: false, current: 0, required: 0 };

  const voiceChannel = member.guild.channels.cache.get(player.voiceChannelId!);
  if (!voiceChannel?.isVoiceBased()) return { can: false, current: 0, required: 0 };

  const members = voiceChannel.members.filter((m) => !m.user.bot).size;
  const required = Math.ceil(members * ratio);

  return { can: true, current: 0, required };
}

export async function checkQueueLimit(
  member: GuildMember,
  client: KoesuClient
): Promise<boolean> {
  const guild = await client.prisma.guild.findUnique({
    where: { id: member.guild.id },
  });

  const limit = guild?.maxQueuePerUser ?? 0;
  if (limit === 0) return true;

  const player = client.lavalink.getPlayer(member.guild.id);
  if (!player) return true;

  const userTracks = player.queue.tracks.filter(
    (t) => (t.requester as GuildMember)?.id === member.id
  ).length;

  return userTracks < limit;
}
