/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
        // Create user table
        .createTable('user', (table) => {
            table.increments('id').primary();
            table.string('email', 255).notNullable().unique();
            table.string('password_hash', 255).notNullable();
            table.string('display_name', 255).notNullable();
            table.string('avatar_url', 512).nullable();
            table.boolean('is_active').notNullable().defaultTo(true);
            table.boolean('is_verified').notNullable().defaultTo(false);
            table.timestamp('last_login_at').nullable();
            table.timestamps(true, true);

            table.index('email');
        })
        // Create role table
        .createTable('role', (table) => {
            table.increments('id').primary();
            table.string('name', 100).notNullable().unique();
            table.string('description', 500).nullable();
            table.boolean('is_system').notNullable().defaultTo(false);
            table.timestamps(true, true);
        })
        // Create permission table
        .createTable('permission', (table) => {
            table.increments('id').primary();
            table.string('name', 100).notNullable().unique();
            table.string('resource', 50).notNullable();
            table.string('action', 50).notNullable();
            table.timestamps(true, true);

            table.unique(['resource', 'action']);
        })
        // Create user_role junction table
        .createTable('user_role', (table) => {
            table.increments('id').primary();
            table.integer('user_id').unsigned().notNullable()
                .references('id').inTable('user').onDelete('CASCADE');
            table.integer('role_id').unsigned().notNullable()
                .references('id').inTable('role').onDelete('CASCADE');
            table.timestamps(true, true);

            table.unique(['user_id', 'role_id']);
        })
        // Create role_permission junction table
        .createTable('role_permission', (table) => {
            table.increments('id').primary();
            table.integer('role_id').unsigned().notNullable()
                .references('id').inTable('role').onDelete('CASCADE');
            table.integer('permission_id').unsigned().notNullable()
                .references('id').inTable('permission').onDelete('CASCADE');
            table.timestamps(true, true);

            table.unique(['role_id', 'permission_id']);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists('role_permission')
        .dropTableIfExists('user_role')
        .dropTableIfExists('permission')
        .dropTableIfExists('role')
        .dropTableIfExists('user');
};
