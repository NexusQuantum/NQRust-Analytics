/**
 * Migration for login_attempt table
 * Tracks login attempts for rate limiting and account lockout
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('login_attempt', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().nullable()
            .references('id').inTable('user').onDelete('SET NULL')
            .comment('NULL if login attempt was for non-existent email');
        table.string('email', 255).notNullable();
        table.string('ip_address', 45).notNullable();
        table.boolean('success').notNullable().defaultTo(false);
        table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
        table.string('user_agent', 500).nullable();
        table.string('failure_reason', 100).nullable()
            .comment('INVALID_PASSWORD, ACCOUNT_LOCKED, RATE_LIMITED, etc.');

        // Indexes for efficient querying
        table.index('ip_address');
        table.index('email');
        table.index('user_id');
        table.index('attempted_at');
        table.index(['ip_address', 'attempted_at']);
        table.index(['email', 'attempted_at']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('login_attempt');
};
