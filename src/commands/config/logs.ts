import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configura el canal de logs y fuentes bloqueadas")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName("canal").setDescription("Canal de logs").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("bloquear").setDescription("Fuentes a bloquear separadas por coma").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("desbloquear").setDescription("Fuentes a desbloquear separadas por coma").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const canal = interaction.options.getChannel("canal") as TextChannel | null;
    const bloquear = interaction.options.getString("bloquear");
    const desbloquear = interaction.options.getString("desbloquear");

    const guild = await client.prisma.guild.findUnique({
      where: { id: guildId },
    });

    let blocked: string[] = JSON.parse(guild?.blockedGenres ?? "[]");

    if (bloquear) {
      const toBlock = bloquear.split(",").map((g) => g.trim().toLowerCase());
      blocked = [...new Set([...blocked, ...toBlock])];
    }

    if (desbloquear) {
      const toUnblock = desbloquear.split(",").map((g) => g.trim().toLowerCase());
      blocked = blocked.filter((g) => !toUnblock.includes(g));
    }

    const data: Record<string, unknown> = {
      blockedGenres: JSON.stringify(blocked),
    };

    if (canal) data.logChannelId = canal.id;

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...data },
      update: data,
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed(
        `Logs actualizado. Fuentes bloqueadas: ${blocked.length > 0 ? blocked.join(", ") : "ninguna"}`
      )],
    });
  },
};
