/**
 * Migration to create thread_share table for sharing chat threads between users.
 * Similar to dashboard_share, this allows users to share their chat history with others.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    await knex.schema.createTable('thread_share', (table) => {
        table.increments('id').primary();
        table
            .integer('thread_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('thread')
            .onDelete('CASCADE')
            .comment('Thread being shared');
        table
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('user')
            .onDelete('CASCADE')
            .comment('User the thread is shared with');
        table
            .string('permission', 20)
            .notNullable()
            .defaultTo('view')
            .comment('Permission level: view or edit');
        table.timestamps(true, true);

        // Unique constraint: can only share with a user once
        table.unique(['thread_id', 'user_id']);
        table.index(['thread_id']);
        table.index(['user_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('thread_share');
};
