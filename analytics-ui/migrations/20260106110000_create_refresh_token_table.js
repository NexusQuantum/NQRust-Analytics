/**
 * Migration for refresh_token table
 * Stores long-lived refresh tokens for token rotation
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('refresh_token', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable()
            .references('id').inTable('user').onDelete('CASCADE');
        table.string('token_hash', 255).notNullable().unique();
        table.string('family_id', 64).notNullable().comment('Token family for rotation detection');
        table.timestamp('expires_at').notNullable();
        table.timestamp('revoked_at').nullable();
        table.string('ip_address', 45).nullable();
        table.string('user_agent', 500).nullable();
        table.timestamps(true, true);

        table.index('user_id');
        table.index('token_hash');
        table.index('family_id');
        table.index('expires_at');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('refresh_token');
};
