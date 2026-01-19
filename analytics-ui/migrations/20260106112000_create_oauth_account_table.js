/**
 * Migration for oauth_account table
 * Stores OAuth provider connections for users
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('oauth_account', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable()
            .references('id').inTable('user').onDelete('CASCADE');
        table.string('provider', 50).notNullable()
            .comment('google, github, etc.');
        table.string('provider_user_id', 255).notNullable()
            .comment('User ID from the OAuth provider');
        table.string('provider_email', 255).nullable();
        table.string('display_name', 255).nullable();
        table.string('avatar_url', 500).nullable();
        table.text('access_token').nullable()
            .comment('Encrypted OAuth access token');
        table.text('refresh_token').nullable()
            .comment('Encrypted OAuth refresh token');
        table.timestamp('token_expires_at').nullable();
        table.timestamps(true, true);

        // Unique constraint: one OAuth account per provider per user
        table.unique(['user_id', 'provider']);
        // Unique constraint: provider + provider_user_id should be unique
        table.unique(['provider', 'provider_user_id']);

        table.index('user_id');
        table.index('provider');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('oauth_account');
};
