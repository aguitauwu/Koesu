import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";
import { updatePanel } from "../../panel/index.js";
import type { KoesuClient } from "../../client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Configura el panel de musica")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt.setName("canal").setDescription("Canal donde mostrar el panel").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("color").setDescription("Color del embed en hex").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("titulo").setDescription("Titulo del panel").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("footer").setDescription("Footer del panel").setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt.setName("thumbnail").setDescription("Mostrar thumbnail").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("botones").setDescription("Botones activos separados por coma").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const client = interaction.client as KoesuClient;
    const guildId = interaction.guildId as string;

    await interaction.deferReply({ ephemeral: true });

    const canal = interaction.options.getChannel("canal") as TextChannel | null;
    const color = interaction.options.getString("color");
    const titulo = interaction.options.getString("titulo");
    const footer = interaction.options.getString("footer");
    const thumbnail = interaction.options.getBoolean("thumbnail");
    const botones = interaction.options.getString("botones");

    const data: Record<string, unknown> = {};
    if (canal) data.panelChannelId = canal.id;
    if (color) data.panelColor = color;
    if (titulo) data.panelTitle = titulo;
    if (footer) data.panelFooter = footer;
    if (thumbnail !== null) data.panelThumbnail = thumbnail;
    if (botones) {
      const list = botones.split(",").map((b) => b.trim());
      data.panelButtons = JSON.stringify(list);
    }

    await client.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...data },
      update: data,
    });

    const player = client.lavalink.getPlayer(guildId);
    await updatePanel(client, guildId, player?.queue.current ?? null);

    await interaction.editReply({
      embeds: [buildSuccessEmbed("Panel actualizado")],
    });
  },
};
