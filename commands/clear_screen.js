const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear messages from the channel")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");

    try {
      await interaction.deferReply({ ephemeral: true });

      const messages = await interaction.channel.messages.fetch({
        limit: amount,
      });
      const deleted = await interaction.channel.bulkDelete(messages, true);

      await interaction.editReply({
        content: `✅ Successfully deleted ${deleted.size} message(s)!`,
      });
    } catch (error) {
      console.error("Error clearing messages:", error);
      await interaction.editReply({
        content:
          "❌ Failed to clear messages. Make sure the messages are less than 14 days old.",
      });
    }
  },
};
