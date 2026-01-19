/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // Create audit_log table for tracking user actions
        .createTable('audit_log', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().nullable()
                .references('id').inTable('user').onDelete('SET NULL');
            table.string('action', 100).notNullable();
            table.string('resource_type', 100).notNullable();
            table.string('resource_id', 100).nullable();
            table.jsonb('details').nullable();
            table.string('ip_address', 45).nullable();
            table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

            table.index('user_id');
            table.index('action');
            table.index('resource_type');
            table.index('created_at');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('audit_log');
};
