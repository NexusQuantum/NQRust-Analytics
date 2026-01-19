/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // Create starred_dashboard table for user's starred/favorite dashboards
    await knex.schema.createTable('starred_dashboard', (table) => {
        table.increments('id').primary();
        table
            .integer('dashboard_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('dashboard')
            .onDelete('CASCADE')
            .comment('Dashboard that is starred');
        table
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('user')
            .onDelete('CASCADE')
            .comment('User who starred the dashboard');
        table.timestamps(true, true);
        
        // Unique constraint - a user can only star a dashboard once
        table.unique(['dashboard_id', 'user_id']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('starred_dashboard');
};
