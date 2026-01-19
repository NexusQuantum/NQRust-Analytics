/**
 * Migration to add user_id to thread table to support user-specific chat history.
 * Each thread will now be owned by a specific user.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Add user_id column to thread table
    await knex.schema.alterTable('thread', (table) => {
        table
            .integer('user_id')
            .unsigned()
            .nullable() // Initially nullable for existing data
            .references('id')
            .inTable('user')
            .onDelete('CASCADE')
            .comment('User who owns this thread/chat history');

        table.index(['user_id']);
    });

    // Set existing threads to the first user (if any exist)
    const firstUser = await knex('user').orderBy('id').first();
    if (firstUser) {
        await knex('thread').whereNull('user_id').update({ user_id: firstUser.id });
    }

    // Note: We keep user_id nullable to handle cases where:
    // 1. There are no users yet in the system
    // 2. Legacy data migration scenarios
    // The application code should enforce user_id is set for new threads
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('thread', (table) => {
        table.dropColumn('user_id');
    });
};
