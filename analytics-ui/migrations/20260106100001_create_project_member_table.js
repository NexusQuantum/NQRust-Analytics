/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // Create project_member table for project-level access control
        .createTable('project_member', (table) => {
            table.increments('id').primary();
            table.integer('project_id').unsigned().notNullable()
                .references('id').inTable('project').onDelete('CASCADE');
            table.integer('user_id').unsigned().notNullable()
                .references('id').inTable('user').onDelete('CASCADE');
            table.enu('role', ['owner', 'editor', 'viewer']).notNullable().defaultTo('viewer');
            table.integer('invited_by').unsigned().nullable()
                .references('id').inTable('user').onDelete('SET NULL');
            table.timestamps(true, true);

            table.unique(['project_id', 'user_id']);
            table.index('project_id');
            table.index('user_id');
        })
        // Create user_session table for session management
        .createTable('user_session', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().notNullable()
                .references('id').inTable('user').onDelete('CASCADE');
            table.string('token_hash', 255).notNullable().unique();
            table.timestamp('expires_at').notNullable();
            table.string('ip_address', 45).nullable();
            table.string('user_agent', 500).nullable();
            table.timestamps(true, true);

            table.index('user_id');
            table.index('expires_at');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('user_session')
        .dropTableIfExists('project_member');
};
