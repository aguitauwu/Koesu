import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { buildErrorEmbed, buildSuccessEmbed } from "../../utils/embed.js";
import { isInVoice, isSameVoice } from "../../utils/permissions.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tts")
    .setDescription("Convierte texto a voz en el canal de voz")
    .addStringOption((opt) =>
      opt.setName("texto").setDescription("Texto a convertir").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("voz").setDescription("Voz a usar (depende de la API configurada)").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    if (!await isInVoice(member)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en un canal de voz")] });
      return;
    }

    if (!await isSameVoice(member, client)) {
      await interaction.editReply({ embeds: [buildErrorEmbed("Debes estar en el mismo canal de voz que el bot")] });
      return;
    }

    const texto = interaction.options.getString("texto", true);
    const voz = interaction.options.getString("voz");

    const guildConfig = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (!guildConfig?.ttsApiUrl) {
      await interaction.editReply({ embeds: [buildErrorEmbed("TTS no configurado. Usa /tts-config primero")] });
      return;
    }

    const voice = voz ?? guildConfig.ttsVoice ?? "default";

    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId,
        voiceChannelId: member.voice.channelId as string,
        textChannelId: interaction.channelId,
        selfDeaf: true,
      });
      await player.connect();
    }

    const ttsUrl = `${guildConfig.ttsApiUrl}?text=${encodeURIComponent(texto)}&voice=${encodeURIComponent(voice)}`;

    const result = await player.search({ query: ttsUrl, source: "http" }, member);

    if (!result || result.loadType === "error" || result.loadType === "empty") {
      await interaction.editReply({ embeds: [buildErrorEmbed("Error generando TTS")] });
      return;
    }

    await player.queue.add(result.tracks[0]);
    if (!player.playing) await player.play();

    await interaction.editReply({ embeds: [buildSuccessEmbed(`TTS en cola: *${texto.slice(0, 50)}${texto.length > 50 ? "..." : ""}*`)] });
  },
};
