import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { buildSuccessEmbed } from "../../utils/embed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("rpc")
    .setDescription("Activa el RPC de Discord para mostrar la cancion que escuchas"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const port = process.env.RPC_PORT ?? 3000;
    const host = process.env.RPC_REDIRECT_URI ?? `http://localhost:${port}`;

    await interaction.reply({
      embeds: [
        buildSuccessEmbed(
          `Autoriza a Koesu para actualizar tu RPC:\n\n${host}/rpc/auth\n\nEsta ventana se puede cerrar despues de autorizar.`
        ),
      ],
      ephemeral: true,
    });
  },
};
