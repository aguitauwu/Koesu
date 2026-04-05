import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isInVoice } from "../../utils/permissions.js";
import { resolve } from "../../ytdlp/client.js";
import { updatePanel } from "../../panel/index.js";
import type { KoesuClient } from "../../client.js";

const TEST_QUERY = "Bad Apple";

export default {
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Prueba que Koesu puede reproducir musica usando Bad Apple"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    if (!await isInVoice(member)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz para la prueba")] });
      return;
    }

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    const musicDir = process.env.MUSIC_DIR ?? "/root/musica";
    const resolved = await resolve(TEST_QUERY, "local", musicDir);

    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId,
        voiceChannelId: member.voice.channelId as string,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: guildConfig?.volume ?? 100,
      });
    }

    await player.connect();

    if (resolved && !resolved.passthrough) {
      const result = await player.search({ query: resolved.streamUrl.replace("localhost", process.env.LAVALINK_YTDLP_HOST ?? "172.17.0.1"), source: "http" }, member);

      if (!result || result.loadType === "error" || result.loadType === "empty") {
        await interaction.editReply({ embeds: [buildErrorEmbed("Test fallido: no se pudo cargar el audio local")] });
        return;
      }

      const track = result.tracks[0];
      track.info.title = resolved.title;
      track.info.author = "Local";

      await player.queue.add(track);
      if (!player.playing) await player.play();
      await updatePanel(client, guildId, player.queue.current);

      await interaction.editReply({
        embeds: [buildSuccessEmbed(`Test exitoso. Reproduciendo: **${resolved.title}** desde carpeta local`)],
      });
    } else {
      const result = await player.search({ query: `ytsearch:${TEST_QUERY}` }, member);

      if (!result || result.loadType === "error" || result.loadType === "empty") {
        await interaction.editReply({ embeds: [buildErrorEmbed("Test fallido: no se encontro Bad Apple en ninguna fuente")] });
        return;
      }

      const track = result.tracks[0];
      await player.queue.add(track);
      if (!player.playing) await player.play();
      await updatePanel(client, guildId, player.queue.current);

      await interaction.editReply({
        embeds: [buildSuccessEmbed(`Test exitoso via SoundCloud/Lavalink. Reproduciendo: **${track.info.title}**`)],
      });
    }
  },
};
